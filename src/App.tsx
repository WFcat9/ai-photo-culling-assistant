import {
  Aperture,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  Image,
  Info,
  Loader2,
  RefreshCw,
  ScanFace,
  Trash2,
  Upload,
  Wrench,
  XCircle,
} from 'lucide-react';
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { warmupFaceLandmarker } from './lib/faceSignals';
import { analyzeImageFile } from './lib/photoMetrics';
import {
  describeEyeStatus,
  describeFaceDetectionMode,
  DimensionAssessment,
  PhotoAssessment,
  PhotoDecision,
  RawPhotoMetrics,
  scorePhoto,
  summarizeAssessments,
} from './lib/photoScoring';

type PhotoStatus = 'queued' | 'analyzing' | 'done' | 'error';

type PhotoItem = {
  id: string;
  fileName: string;
  fileSize: number;
  previewUrl: string;
  status: PhotoStatus;
  metrics?: RawPhotoMetrics;
  assessment?: PhotoAssessment;
  errorMessage?: string;
};

type DemoSample = {
  fileName: string;
  url: string;
};

type FilterValue = 'all' | PhotoDecision;
type FaceEngineStatus = 'loading' | 'ready' | 'failed';

const DEMO_PORTRAITS: DemoSample[] = [
  { fileName: '示例-人像-1.jpeg', url: '/portfolio/camera-girl.jpeg' },
  { fileName: '示例-人像-2.jpeg', url: '/portfolio/seaside-portrait.jpeg' },
];

const decisionMeta: Record<PhotoDecision, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  keep: { label: '保留', tone: 'keep', icon: CheckCircle2 },
  review: { label: '待修', tone: 'review', icon: Wrench },
  reject: { label: '淘汰', tone: 'reject', icon: XCircle },
};

const filters: { value: FilterValue; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'keep', label: '保留' },
  { value: 'review', label: '待修' },
  { value: 'reject', label: '淘汰' },
];

function formatFileSize(fileSize: number) {
  if (fileSize < 1024 * 1024) return `${Math.round(fileSize / 1024)} KB`;
  return `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
}

function createPhotoId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function buildReportRows(photos: PhotoItem[]) {
  return photos
    .filter((photo) => photo.assessment && photo.metrics)
    .map((photo) => {
      const assessment = photo.assessment!;
      const metrics = photo.metrics!;

      return {
        fileName: photo.fileName,
        decision: decisionMeta[assessment.status].label,
        score: assessment.score,
        width: metrics.width,
        height: metrics.height,
        brightness: metrics.brightness,
        contrast: metrics.contrast,
        darkPixelRatio: formatPercent(metrics.darkPixelRatio),
        brightPixelRatio: formatPercent(metrics.brightPixelRatio),
        tiltDegrees: metrics.tiltDegrees,
        visualWeight: `${Math.round(metrics.visualWeightX * 100)}%, ${Math.round(metrics.visualWeightY * 100)}%`,
        faceCount: metrics.faceCount ?? 0,
        faceDetectionMode: describeFaceDetectionMode(metrics.faceDetectionMode),
        eyeStatus: describeEyeStatus(metrics.eyeStatus),
        dimensions: assessment.dimensionAssessments.map((dimension) => `${dimension.label}:${dimension.summary}`).join('；'),
        suggestions: assessment.suggestions.join('；'),
      };
    });
}

function downloadReport(photos: PhotoItem[]) {
  const rows = buildReportRows(photos);
  const header = [
    '文件名',
    '判断',
    '综合分',
    '宽',
    '高',
    '亮度',
    '对比度',
    '暗部比例',
    '过曝比例',
    '倾斜角',
    '视觉重心',
    '识别到的人脸数',
    '人脸识别路径',
    '眼部状态',
    '多维评价',
    '改进建议',
  ];
  const csvRows = [
    header,
    ...rows.map((row) => [
      row.fileName,
      row.decision,
      String(row.score),
      String(row.width),
      String(row.height),
      String(row.brightness),
      String(row.contrast),
      row.darkPixelRatio,
      row.brightPixelRatio,
      String(row.tiltDegrees),
      row.visualWeight,
      String(row.faceCount),
      row.faceDetectionMode,
      row.eyeStatus,
      row.dimensions,
      row.suggestions,
    ]),
  ];
  const csvContent = csvRows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');

  link.href = URL.createObjectURL(blob);
  link.download = 'photo-content-analysis-report.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: PhotoDecision }) {
  const meta = decisionMeta[decision];
  const Icon = meta.icon;

  return (
    <span className={`decision-badge decision-${meta.tone}`}>
      <Icon aria-hidden="true" size={15} />
      {meta.label}
    </span>
  );
}

function DimensionCard({ dimension }: { dimension: DimensionAssessment }) {
  return (
    <article className={`dimension-card dimension-${dimension.status}`}>
      <div>
        <span>{dimension.label}</span>
        <strong>{dimension.score}</strong>
      </div>
      <p>{dimension.summary}</p>
      <ul>
        {dimension.suggestions.slice(0, 3).map((suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        ))}
      </ul>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Image aria-hidden="true" size={40} />
      <h2>先拖入一批照片</h2>
      <p>这一版会从构图、光影、曝光、暗部、人物状态和画面比例六个方向筛片，不再用清晰度打分。</p>
    </div>
  );
}

async function buildDemoFile(sample: DemoSample) {
  const response = await fetch(sample.url);

  if (!response.ok) {
    throw new Error('示例照片读取失败。');
  }

  const blob = await response.blob();

  return new File([blob], sample.fileName, {
    type: blob.type || 'image/jpeg',
    lastModified: Date.now(),
  });
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [faceEngineStatus, setFaceEngineStatus] = useState<FaceEngineStatus>('loading');
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void warmupFaceLandmarker()
      .then(() => {
        if (isActive) setFaceEngineStatus('ready');
      })
      .catch(() => {
        if (isActive) setFaceEngineStatus('failed');
      });

    return () => {
      isActive = false;
    };
  }, []);

  const completedAssessments = photos
    .map((photo) => photo.assessment)
    .filter((assessment): assessment is PhotoAssessment => Boolean(assessment));

  const summary = summarizeAssessments(completedAssessments);
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? photos[0];
  const visiblePhotos = useMemo(() => {
    if (activeFilter === 'all') return photos;
    return photos.filter((photo) => photo.assessment?.status === activeFilter);
  }, [activeFilter, photos]);

  async function analyzeOnePhoto(photo: PhotoItem, file: File) {
    setPhotos((currentPhotos) =>
      currentPhotos.map((currentPhoto) =>
        currentPhoto.id === photo.id ? { ...currentPhoto, status: 'analyzing' } : currentPhoto,
      ),
    );

    try {
      const metrics = await analyzeImageFile(file);
      const assessment = scorePhoto(metrics);

      setPhotos((currentPhotos) =>
        currentPhotos.map((currentPhoto) =>
          currentPhoto.id === photo.id ? { ...currentPhoto, status: 'done', metrics, assessment } : currentPhoto,
        ),
      );
    } catch (error) {
      setPhotos((currentPhotos) =>
        currentPhotos.map((currentPhoto) =>
          currentPhoto.id === photo.id
            ? {
                ...currentPhoto,
                status: 'error',
                errorMessage: error instanceof Error ? error.message : '图片读取失败。',
              }
            : currentPhoto,
        ),
      );
    }
  }

  function handleFiles(fileList: FileList | File[]) {
    const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    const nextPhotos = imageFiles.map((file) => ({
      id: createPhotoId(file),
      fileName: file.name,
      fileSize: file.size,
      previewUrl: URL.createObjectURL(file),
      status: 'queued' as const,
    }));

    if (nextPhotos.length === 0) return;

    setNoticeMessage(null);
    setPhotos((currentPhotos) => [...nextPhotos, ...currentPhotos]);
    setSelectedPhotoId(nextPhotos[0].id);
    nextPhotos.forEach((photo, index) => {
      void analyzeOnePhoto(photo, imageFiles[index]);
    });
  }

  async function loadDemoPortraits() {
    setIsLoadingSamples(true);
    setNoticeMessage(null);

    try {
      const demoFiles = await Promise.all(DEMO_PORTRAITS.map((sample) => buildDemoFile(sample)));
      handleFiles(demoFiles);
      setNoticeMessage('已载入两张示例人像，你可以直接查看人脸识别和建议结果。');
    } catch {
      setNoticeMessage('示例照片加载失败，请稍后重试。');
    } finally {
      setIsLoadingSamples(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;
    handleFiles(event.target.files);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  function clearPhotos() {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPhotos([]);
    setSelectedPhotoId(null);
    setActiveFilter('all');
    setNoticeMessage(null);
  }

  return (
    <main className="app-shell">
      <section className="workspace-header">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Camera aria-hidden="true" size={19} />
          </span>
          <span>AI 摄影筛片助手</span>
        </div>

        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload aria-hidden="true" size={17} />
            选择照片
          </button>
          <button className="ghost-button" type="button" onClick={() => void loadDemoPortraits()} disabled={isLoadingSamples}>
            {isLoadingSamples ? <Loader2 aria-hidden="true" size={17} /> : <Image aria-hidden="true" size={17} />}
            {isLoadingSamples ? '载入示例中' : '加载示例人像'}
          </button>
          <button className="ghost-button" type="button" onClick={() => downloadReport(photos)} disabled={summary.totalCount === 0}>
            <Download aria-hidden="true" size={17} />
            导出报告
          </button>
          <button className="icon-button" type="button" onClick={clearPhotos} disabled={photos.length === 0} aria-label="清空照片">
            <Trash2 aria-hidden="true" size={18} />
          </button>
        </div>
      </section>

      <section className="hero-workspace">
        <div className="upload-column">
          <div>
            <h1>从画面内容出发，做更像摄影师的筛片判断。</h1>
            <p>
              本地分析构图、光影、曝光、暗部、人物状态和画面比例，给出可执行的裁切与后期建议。照片不会上传，适合免费部署给别人使用。
            </p>
          </div>

          <label
            className={`drop-zone ${isDragging ? 'is-dragging' : ''}`}
            onDragEnter={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleInputChange} />
            <Upload aria-hidden="true" size={34} />
            <strong>拖入照片，或点击选择</strong>
            <span>支持 JPG、PNG、WebP 等常见图片格式</span>
          </label>

          <div className="notice-row">
            <Info aria-hidden="true" size={16} />
            当前免费版不调用付费视觉 API；人脸模型状态：
            <strong className={`engine-status engine-${faceEngineStatus}`}>
              {faceEngineStatus === 'loading' ? '初始化中' : faceEngineStatus === 'ready' ? '已就绪' : '加载失败'}
            </strong>
          </div>
          <div className="notice-row secondary-note">
            <ScanFace aria-hidden="true" size={16} />
            未识别到人脸时，系统会自动尝试整图、上半区和中心区三轮补检；如果还抓不到，通常说明脸太小、遮挡太多或角度太偏。
          </div>
          <div className="notice-row secondary-note">
            <ScanFace aria-hidden="true" size={16} />
            人脸更稳的情况：正脸或轻微侧脸、脸部至少占画面短边约 12% 到 15%、眼部无遮挡、别严重过暗或过曝。
          </div>
          {noticeMessage ? (
            <div className="notice-row secondary-note">
              <Info aria-hidden="true" size={16} />
              {noticeMessage}
            </div>
          ) : null}
        </div>

        <div className="summary-panel" aria-label="筛片统计">
          <MetricPill label="已分析" value={summary.totalCount} />
          <MetricPill label="建议保留" value={summary.keepCount} />
          <MetricPill label="进入待修" value={summary.reviewCount} />
          <MetricPill label="建议淘汰" value={summary.rejectCount} />
          <div className="score-meter">
            <span>平均综合分</span>
            <strong>{summary.averageScore}</strong>
            <div>
              <i style={{ width: `${summary.averageScore}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="results-layout">
        <div className="photo-list-region">
          <div className="toolbar">
            <div className="filter-tabs" role="tablist" aria-label="筛选照片">
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={activeFilter === filter.value ? 'is-active' : ''}
                  onClick={() => setActiveFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <button className="subtle-button" type="button" onClick={() => setActiveFilter('all')}>
              <RefreshCw aria-hidden="true" size={15} />
              重看全部
            </button>
          </div>

          {visiblePhotos.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="photo-grid">
              {visiblePhotos.map((photo) => (
                <button
                  className={`photo-card ${selectedPhoto?.id === photo.id ? 'is-selected' : ''}`}
                  type="button"
                  key={photo.id}
                  onClick={() => setSelectedPhotoId(photo.id)}
                >
                  <span className="thumb-wrap">
                    <img src={photo.previewUrl} alt={photo.fileName} />
                    {photo.status === 'analyzing' ? (
                      <span className="analysis-state">
                        <Loader2 aria-hidden="true" size={16} />
                        分析中
                      </span>
                    ) : null}
                  </span>
                  <span className="photo-card-body">
                    <span className="file-name">{photo.fileName}</span>
                    <span className="file-meta">{formatFileSize(photo.fileSize)}</span>
                    {photo.assessment ? <DecisionBadge decision={photo.assessment.status} /> : null}
                    {photo.status === 'error' ? <span className="error-text">{photo.errorMessage}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="detail-panel" aria-label="照片分析详情">
          {selectedPhoto ? (
            <>
              <div className="detail-media">
                <img src={selectedPhoto.previewUrl} alt={selectedPhoto.fileName} />
              </div>

              <div className="detail-content">
                <div className="detail-heading">
                  <div>
                    <span>当前照片</span>
                    <h2>{selectedPhoto.fileName}</h2>
                  </div>
                  {selectedPhoto.assessment ? <DecisionBadge decision={selectedPhoto.assessment.status} /> : null}
                </div>

                {selectedPhoto.assessment && selectedPhoto.metrics ? (
                  <>
                    <div className="quality-score">
                      <span>综合分</span>
                      <strong>{selectedPhoto.assessment.score}</strong>
                    </div>

                    <div className="dimension-grid">
                      {selectedPhoto.assessment.dimensionAssessments.map((dimension) => (
                        <DimensionCard key={dimension.key} dimension={dimension} />
                      ))}
                    </div>

                    <div className="metric-grid">
                      <MetricPill label="尺寸" value={`${selectedPhoto.metrics.width} x ${selectedPhoto.metrics.height}`} />
                      <MetricPill label="亮度" value={selectedPhoto.metrics.brightness} />
                      <MetricPill label="对比度" value={selectedPhoto.metrics.contrast} />
                      <MetricPill label="暗部比例" value={formatPercent(selectedPhoto.metrics.darkPixelRatio)} />
                      <MetricPill label="过曝比例" value={formatPercent(selectedPhoto.metrics.brightPixelRatio)} />
                      <MetricPill
                        label="视觉重心"
                        value={`${Math.round(selectedPhoto.metrics.visualWeightX * 100)}%, ${Math.round(
                          selectedPhoto.metrics.visualWeightY * 100,
                        )}%`}
                      />
                    </div>

                    <div className="suggestion-block">
                      <div className="block-title">
                        <Aperture aria-hidden="true" size={17} />
                        重点修改建议
                      </div>
                      <ul>
                        {selectedPhoto.assessment.suggestions.slice(0, 10).map((suggestion) => (
                          <li key={suggestion}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="suggestion-block portrait-note">
                      <div className="block-title">
                        <ScanFace aria-hidden="true" size={17} />
                        人物状态说明
                      </div>
                      <p>
                        当前识别到 {selectedPhoto.metrics.faceCount ?? 0} 张人脸；识别路径为
                        {describeFaceDetectionMode(selectedPhoto.metrics.faceDetectionMode)}；眼部状态判断为
                        {describeEyeStatus(selectedPhoto.metrics.eyeStatus)}。
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="pending-detail">
                    <Loader2 aria-hidden="true" size={20} />
                    正在读取画面内容数据
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <FileText aria-hidden="true" size={42} />
              <p>选择一张照片后，这里会显示六个维度的摄影点评和具体改进建议。</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

export default App;
