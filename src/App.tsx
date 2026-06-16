import {
  Camera,
  CheckCircle2,
  Download,
  FileText,
  Image,
  Info,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Wrench,
  XCircle,
} from 'lucide-react';
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import { analyzeImageFile } from './lib/photoMetrics';
import { PhotoAssessment, PhotoDecision, RawPhotoMetrics, scorePhoto, summarizeAssessments } from './lib/photoScoring';

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

type FilterValue = 'all' | PhotoDecision;

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

function buildReportRows(photos: PhotoItem[]) {
  return photos
    .filter((photo) => photo.assessment && photo.metrics)
    .map((photo) => ({
      fileName: photo.fileName,
      decision: decisionMeta[photo.assessment!.status].label,
      score: photo.assessment!.score,
      width: photo.metrics!.width,
      height: photo.metrics!.height,
      sharpness: photo.metrics!.sharpness,
      brightness: photo.metrics!.brightness,
      contrast: photo.metrics!.contrast,
      tiltDegrees: photo.metrics!.tiltDegrees,
      suggestions: photo.assessment!.suggestions.join('；'),
    }));
}

function downloadReport(photos: PhotoItem[]) {
  const rows = buildReportRows(photos);
  const header = ['文件名', '判断', '分数', '宽', '高', '清晰度', '亮度', '对比度', '倾斜角', '建议'];
  const csvRows = [
    header,
    ...rows.map((row) => [
      row.fileName,
      row.decision,
      String(row.score),
      String(row.width),
      String(row.height),
      String(row.sharpness),
      String(row.brightness),
      String(row.contrast),
      String(row.tiltDegrees),
      row.suggestions,
    ]),
  ];
  const csvContent = csvRows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');

  link.href = URL.createObjectURL(blob);
  link.download = 'photo-screening-report.csv';
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

function EmptyState() {
  return (
    <div className="empty-state">
      <Image aria-hidden="true" size={40} />
      <h2>先拖入一批照片</h2>
      <p>第一版会在本地分析清晰度、曝光、对比度、画面倾斜和尺寸，帮你先筛出明显问题图。</p>
    </div>
  );
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

    setPhotos((currentPhotos) => [...nextPhotos, ...currentPhotos]);
    setSelectedPhotoId(nextPhotos[0].id);
    nextPhotos.forEach((photo, index) => {
      void analyzeOnePhoto(photo, imageFiles[index]);
    });
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
            <h1>批量筛出问题照片，先把选片效率提起来。</h1>
            <p>
              这一版完全在浏览器本地运行，不上传原图。它先做基础质量筛查：模糊、过暗、过曝、低反差、画面倾斜和尺寸偏小。
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
            第一阶段是“初筛助手”，不会替代你的审美判断；它负责把明显坏片先挑出来。
          </div>
        </div>

        <div className="summary-panel" aria-label="筛片统计">
          <MetricPill label="已分析" value={summary.totalCount} />
          <MetricPill label="建议保留" value={summary.keepCount} />
          <MetricPill label="进入待修" value={summary.reviewCount} />
          <MetricPill label="建议淘汰" value={summary.rejectCount} />
          <div className="score-meter">
            <span>平均质量分</span>
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
                      <span>质量分</span>
                      <strong>{selectedPhoto.assessment.score}</strong>
                    </div>

                    <div className="metric-grid">
                      <MetricPill label="尺寸" value={`${selectedPhoto.metrics.width} × ${selectedPhoto.metrics.height}`} />
                      <MetricPill label="清晰度" value={selectedPhoto.metrics.sharpness} />
                      <MetricPill label="亮度" value={selectedPhoto.metrics.brightness} />
                      <MetricPill label="对比度" value={selectedPhoto.metrics.contrast} />
                      <MetricPill label="过暗比例" value={`${Math.round(selectedPhoto.metrics.darkPixelRatio * 100)}%`} />
                      <MetricPill label="过曝比例" value={`${Math.round(selectedPhoto.metrics.brightPixelRatio * 100)}%`} />
                    </div>

                    <div className="suggestion-block">
                      <div className="block-title">
                        <FileText aria-hidden="true" size={17} />
                        筛片建议
                      </div>
                      <ul>
                        {selectedPhoto.assessment.suggestions.map((suggestion) => (
                          <li key={suggestion}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <div className="pending-detail">
                    <Loader2 aria-hidden="true" size={20} />
                    正在读取图片质量数据
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <Image aria-hidden="true" size={42} />
              <p>选择一张照片后，这里会显示详细指标和修改建议。</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

export default App;
