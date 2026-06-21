import {
  Aperture,
  Camera,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Image,
  Info,
  Loader2,
  Palette,
  RefreshCw,
  ScanFace,
  Settings,
  Trash2,
  Upload,
  Wrench,
  XCircle,
} from 'lucide-react';
import { ChangeEvent, CSSProperties, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { generateColorAdjustedPhoto } from './lib/batchColoring';
import { generateWatermarkedPhoto, type WatermarkPosition } from './lib/batchWatermarking';
import { buildColorAdjustmentPlan, buildColorAdjustmentSettings, COLOR_PRESETS, getPresetById } from './lib/colorPresets';
import { FACE_CAPTURE_GUIDE, FACE_REFERENCE_RANGES, isAboveRange, isBelowRange, isWithinRange } from './lib/faceReference';
import { warmupFaceLandmarker } from './lib/faceSignals';
import { analyzeImageFile } from './lib/photoMetrics';
import { getWorkspaceShortcutPlan, type WorkspaceShortcut } from './lib/workspaceNavigation';
import {
  describeFaceDetectionMode,
  describeExpressionBalance,
  describeFaceShapeTendency,
  describeFaceStructureConfidence,
  describeFaceWidthTendency,
  describeEyeStatus,
  describeRetouchReadiness,
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
  file: File;
  fileName: string;
  sourceLabel: string;
  fileSize: number;
  previewUrl: string;
  status: PhotoStatus;
  metrics?: RawPhotoMetrics;
  assessment?: PhotoAssessment;
  errorMessage?: string;
  processedPreviewUrl?: string;
  processedDownloadName?: string;
  processedPresetLabel?: string;
  watermarkedPreviewUrl?: string;
  watermarkedDownloadName?: string;
  watermarkLabel?: string;
};

type DemoSample = {
  fileName: string;
  url: string;
};

type FilterValue = 'all' | PhotoDecision | 'score-60-79' | 'score-80-100' | 'expression-review' | 'retouch-ready';
type FaceEngineStatus = 'loading' | 'ready' | 'failed';
type DetailSectionKey = 'portrait' | 'style' | 'color' | 'export' | 'watermark' | 'summary';
type AssetViewMode = 'original' | 'processed' | 'watermarked';
type ProcessingLogEntry = {
  photoId: string;
  fileName: string;
  presetLabel: string;
  sourceLabel: string;
  status: 'success' | 'error';
  message: string;
};

const DETAIL_SECTION_ORDER: DetailSectionKey[] = ['portrait', 'style', 'color', 'export', 'watermark', 'summary'];

const WATERMARK_POSITION_META: Record<WatermarkPosition, { label: string }> = {
  'bottom-right': { label: '右下角' },
  'bottom-left': { label: '左下角' },
  'top-right': { label: '右上角' },
  center: { label: '居中' },
};

const ASSET_VIEW_META: Record<AssetViewMode, { label: string; exportLabel: string }> = {
  original: { label: '原图', exportLabel: '原图副本' },
  processed: { label: '调色副本', exportLabel: '调色副本' },
  watermarked: { label: '水印副本', exportLabel: '水印副本' },
};

const REFERENCE_DASHBOARD_IMAGE = `${import.meta.env.BASE_URL}portfolio/photography-glass-reference.png`;

const DEMO_PORTRAITS: DemoSample[] = [
  { fileName: '示例-人像-1.jpeg', url: '/portfolio/camera-girl.jpeg' },
  { fileName: '示例-人像-2.jpeg', url: '/portfolio/seaside-portrait.jpeg' },
];

const decisionMeta: Record<PhotoDecision, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  keep: { label: '保留', tone: 'keep', icon: CheckCircle2 },
  review: { label: '待修', tone: 'review', icon: Wrench },
  reject: { label: '淘汰', tone: 'reject', icon: XCircle },
};

type WorkflowCopy = {
  title: string;
  note: string;
};

const filters: { value: FilterValue; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'keep', label: '保留' },
  { value: 'review', label: '待修' },
  { value: 'reject', label: '淘汰' },
  { value: 'expression-review', label: '表情复核' },
  { value: 'retouch-ready', label: '精修候选' },
  { value: 'score-60-79', label: '60-79 分' },
  { value: 'score-80-100', label: '80-100 分' },
];

function formatFileSize(fileSize: number) {
  if (fileSize < 1024 * 1024) return `${Math.round(fileSize / 1024)} KB`;
  return `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
}

function getPhotosForFilter(photoList: PhotoItem[], filterValue: FilterValue) {
  switch (filterValue) {
    case 'all':
      return photoList;
    case 'expression-review':
      return photoList.filter((photo) => {
        const balance = photo.metrics?.expressionBalance;
        return balance === 'needs_review' || balance === 'slight_asymmetry';
      });
    case 'retouch-ready':
      return photoList.filter((photo) => photo.metrics?.retouchReadiness === 'ready');
    case 'score-60-79':
      return photoList.filter((photo) => {
        const score = photo.assessment?.score ?? -1;
        return score >= 60 && score < 80;
      });
    case 'score-80-100':
      return photoList.filter((photo) => (photo.assessment?.score ?? -1) >= 80);
    default:
      return photoList.filter((photo) => photo.assessment?.status === filterValue);
  }
}

function createPhotoId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatOptionalPercent(value?: number) {
  if (typeof value !== 'number') return '--';
  return formatPercent(value);
}

function formatOptionalRatio(value?: number) {
  if (typeof value !== 'number') return '--';
  return value.toFixed(2);
}

function getDimension(assessment: PhotoAssessment | undefined, key: DimensionAssessment['key']) {
  return assessment?.dimensionAssessments.find((dimension) => dimension.key === key);
}

function getScoreBandLabel(score?: number) {
  if (typeof score !== 'number') return '未完成';
  if (score >= 80) return '80-100 分';
  if (score >= 60) return '60-79 分';
  return '0-59 分';
}

function buildFaceFramingNote(metrics: RawPhotoMetrics) {
  const notes: string[] = [];

  if ((metrics.faceSizeRatio ?? 0) > 0) {
    notes.push(`脸部约占画面 ${formatPercent(metrics.faceSizeRatio ?? 0)}`);
  }

  if ((metrics.faceTopMargin ?? 1) < 0.04) {
    notes.push('头顶留白偏紧');
  }

  if ((metrics.faceBottomMargin ?? 1) < 0.035) {
    notes.push('下巴贴边偏紧');
  }

  if ((metrics.faceLeftMargin ?? 1) < 0.03 || (metrics.faceRightMargin ?? 1) < 0.03) {
    notes.push('左右裁切偏紧');
  }

  if (Math.abs(metrics.faceTiltDegrees ?? 0) > 7) {
    notes.push(`头部倾斜约 ${Math.abs(metrics.faceTiltDegrees ?? 0).toFixed(1)}°`);
  }

  return notes.length > 0 ? notes.join('，') : '脸部取景目前比较稳。';
}

function buildFaceStructureNotes(metrics: RawPhotoMetrics) {
  const notes: string[] = [];

  if (typeof metrics.upperThirdRatio === 'number') {
    if (isAboveRange(metrics.upperThirdRatio, FACE_REFERENCE_RANGES.upperThird, 0.01)) notes.push('上庭偏长');
    else if (isBelowRange(metrics.upperThirdRatio, FACE_REFERENCE_RANGES.upperThird, 0.02)) notes.push('上庭偏短');
    else notes.push('上庭基本稳定');
  }

  if (typeof metrics.midThirdRatio === 'number') {
    if (isAboveRange(metrics.midThirdRatio, FACE_REFERENCE_RANGES.midThird, 0.01)) notes.push('中庭偏长');
    else if (isBelowRange(metrics.midThirdRatio, FACE_REFERENCE_RANGES.midThird, 0.01)) notes.push('中庭偏短');
    else notes.push('中庭基本稳定');
  }

  if (typeof metrics.lowerThirdRatio === 'number') {
    if (isAboveRange(metrics.lowerThirdRatio, FACE_REFERENCE_RANGES.lowerThird, 0.01)) notes.push('下庭偏长');
    else if (isBelowRange(metrics.lowerThirdRatio, FACE_REFERENCE_RANGES.lowerThird, 0.01)) notes.push('下庭偏短');
    else notes.push('下庭基本稳定');
  }

  if (typeof metrics.eyeGapRatio === 'number') {
    if (isAboveRange(metrics.eyeGapRatio, FACE_REFERENCE_RANGES.eyeGap, 0.03)) notes.push('眼距偏宽');
    else if (isBelowRange(metrics.eyeGapRatio, FACE_REFERENCE_RANGES.eyeGap, 0.04)) notes.push('眼距偏紧');
    else notes.push('眼距比例自然');
  }

  if (typeof metrics.jawToCheekRatio === 'number') {
    if (isAboveRange(metrics.jawToCheekRatio, FACE_REFERENCE_RANGES.jawToCheek)) notes.push('下颌存在宽感');
    else if (isBelowRange(metrics.jawToCheekRatio, FACE_REFERENCE_RANGES.jawToCheek)) notes.push('下巴收得较快');
    else notes.push('下颌横向稳定');
  }

  return notes.length > 0 ? notes.join('，') : '结构信息仍在补充中。';
}

function buildFaceDetectionReadinessNote(metrics: RawPhotoMetrics) {
  const faceCount = metrics.faceCount ?? 0;
  const faceSizeRatio = metrics.faceSizeRatio ?? 0;
  const detectionMode = metrics.faceDetectionMode ?? 'not_detected';

  if (faceCount === 0) {
    return `更稳的识别条件通常是：${FACE_CAPTURE_GUIDE.checklist.join('、')}。如果这张后面还要做修脸，建议先裁出单人主角再重新分析。`;
  }

  if (faceCount > 1) {
    return '当前画面里有多张人脸，这一版会优先按单人修图思路来判断，想拿到更稳的脸型建议，最好先裁成单人图。';
  }

  if (faceSizeRatio > 0 && faceSizeRatio < 0.04) {
    return `这张已经抓到单人脸，但主角在整张画面里偏小。想让闭眼判断和脸型建议更稳，最好让脸部至少达到画面短边约 ${FACE_CAPTURE_GUIDE.minReliableShortEdgeCoverage} 的可见占比。`;
  }

  if (detectionMode === 'upper_focus' || detectionMode === 'center_focus' || detectionMode === 'tight_center') {
    return '当前是靠局部补检锁定到人脸的，说明人物主体不算特别突出。建议后续精修前先放大看眼睛、嘴角和发际线，再决定要不要继续做脸部塑形。';
  }

  return '当前这张单人人脸识别比较稳，通常已经满足后续闭眼筛查、脸型参考和轻微修脸建议的基础条件。';
}

function buildFaceReferenceSummary(metrics: RawPhotoMetrics) {
  const stableNotes: string[] = [];

  if (isWithinRange(metrics.upperThirdRatio, FACE_REFERENCE_RANGES.upperThird, 0.01)) stableNotes.push('上庭落在参考区间');
  if (isWithinRange(metrics.midThirdRatio, FACE_REFERENCE_RANGES.midThird, 0.01)) stableNotes.push('中庭落在参考区间');
  if (isWithinRange(metrics.lowerThirdRatio, FACE_REFERENCE_RANGES.lowerThird, 0.01)) stableNotes.push('下庭落在参考区间');
  if (isWithinRange(metrics.eyeGapRatio, FACE_REFERENCE_RANGES.eyeGap, 0.03)) stableNotes.push('眼距比例自然');
  if (isWithinRange(metrics.jawToCheekRatio, FACE_REFERENCE_RANGES.jawToCheek, 0.01)) stableNotes.push('下颌宽度比较顺');

  return stableNotes.length > 0
    ? `参考当前单人人像结构库，这张里 ${stableNotes.join('、')}，更适合少量液化、以光影塑形为主。`
    : '这张的面部结构偏向会更明显一些，修图时尽量小幅调整，不要一下子把脸型改得太狠。';
}

function buildExpressionReviewNote(metrics: RawPhotoMetrics) {
  const expressionBalance = metrics.expressionBalance ?? 'unknown';
  const eyeDiff = metrics.eyeBlinkDiffScore;
  const smileDiff = metrics.smileDiffScore;
  const mouthOpen = metrics.mouthOpenScore;

  if (expressionBalance === 'stable') {
    return '人物神态整体比较稳，双眼和嘴角没有明显失衡，可以把精力更多放到肤色和轮廓明暗上。';
  }

  if (expressionBalance === 'slight_asymmetry') {
    return `神态有一点轻微不对称${typeof eyeDiff === 'number' ? `，眼部差值约 ${eyeDiff.toFixed(2)}` : ''}${typeof smileDiff === 'number' ? `，嘴角差值约 ${smileDiff.toFixed(2)}` : ''}，建议放大看眼神和嘴角再决定要不要精修。`;
  }

  if (expressionBalance === 'needs_review') {
    return `这张神态建议优先复核${typeof mouthOpen === 'number' ? `，当前嘴部开合参考约 ${mouthOpen.toFixed(2)}` : ''}，如果是一瞬间表情没收住，通常换片比硬修更划算。`;
  }

  return '当前表情数据还不够完整，最好顺手放大看一下双眼开合、嘴角高低和脸部是否有轻微抽动。';
}

function buildRetouchReadinessNote(metrics: RawPhotoMetrics) {
  const retouchReadiness = metrics.retouchReadiness ?? 'hold';

  if (retouchReadiness === 'ready') {
    return '这张现在就可以作为精修候选，优先去做肤色统一、轮廓光影和发丝边缘整理。';
  }

  if (retouchReadiness === 'conditional') {
    return '这张更适合先放大复核一轮，再进入精修，尤其要看眼神、嘴角、法令纹和下颌边界。';
  }

  return '这张暂时不建议直接进精修，先确认闭眼、神态或主脸识别是否稳定，会比后面硬救更省时间。';
}

function getExpressionListChip(metrics?: RawPhotoMetrics) {
  const balance = metrics?.expressionBalance ?? 'unknown';

  if (balance === 'needs_review') {
    return { label: '表情复核', tone: 'review' as const };
  }

  if (balance === 'slight_asymmetry') {
    return { label: '轻微偏差', tone: 'notice' as const };
  }

  if (balance === 'stable') {
    return { label: '神态稳定', tone: 'good' as const };
  }

  return { label: '神态待看', tone: 'neutral' as const };
}

function getRetouchListChip(metrics?: RawPhotoMetrics) {
  const readiness = metrics?.retouchReadiness ?? 'hold';

  if (readiness === 'ready') {
    return { label: '可进精修', tone: 'good' as const };
  }

  if (readiness === 'conditional') {
    return { label: '放大再修', tone: 'notice' as const };
  }

  return { label: '先别精修', tone: 'review' as const };
}

function buildStyleReference(metrics: RawPhotoMetrics) {
  if ((metrics.faceCount ?? 0) === 1 && metrics.darkPixelRatio < 0.22 && metrics.brightPixelRatio < 0.16) {
    return {
      title: '清爽人像基调',
      note: '更适合做干净、通透、肤色自然偏白的人像统一。',
    };
  }

  if (metrics.darkPixelRatio > 0.26) {
    return {
      title: '情绪感人像基调',
      note: '更适合保留一点暗部氛围，再轻轻把脸部提出来，不要修得太亮太平。',
    };
  }

  if (metrics.width / Math.max(1, metrics.height) > 1.6) {
    return {
      title: '环境叙事人像基调',
      note: '构图更偏环境说明，适合保留场景关系，再统一人物与背景的色彩节奏。',
    };
  }

  return {
    title: '稳妥通用基调',
    note: '先保证构图和曝光稳定，再用轻一点的预设统一整组画面更稳。',
  };
}

function buildReportRows(photos: PhotoItem[]) {
  return photos
    .filter((photo) => photo.assessment && photo.metrics)
    .map((photo) => {
      const assessment = photo.assessment!;
      const metrics = photo.metrics!;
      const colorPlan = buildColorAdjustmentPlan(metrics);
      const recommendedPresetLabels = colorPlan.recommendedPresetIds
        .map((presetId) => getPresetById(presetId)?.label)
        .filter((label): label is string => Boolean(label));

      return {
        fileName: photo.fileName,
        sourceLabel: photo.sourceLabel,
        decision: decisionMeta[assessment.status].label,
        score: assessment.score,
        scoreBand: getScoreBandLabel(assessment.score),
        width: metrics.width,
        height: metrics.height,
        brightness: metrics.brightness,
        contrast: metrics.contrast,
        darkPixelRatio: formatPercent(metrics.darkPixelRatio),
        brightPixelRatio: formatPercent(metrics.brightPixelRatio),
        tiltDegrees: metrics.tiltDegrees,
        faceCount: metrics.faceCount ?? 0,
        faceDetectionMode: describeFaceDetectionMode(metrics.faceDetectionMode),
        eyeStatus: describeEyeStatus(metrics.eyeStatus),
        faceShapeTendency: describeFaceShapeTendency(metrics.faceShapeTendency),
        faceWidthTendency: describeFaceWidthTendency(metrics.faceWidthTendency),
        faceStructureConfidence: describeFaceStructureConfidence(metrics.faceStructureConfidence),
        faceSizeRatio: formatOptionalPercent(metrics.faceSizeRatio),
        upperThirdRatio: formatOptionalRatio(metrics.upperThirdRatio),
        midThirdRatio: formatOptionalRatio(metrics.midThirdRatio),
        lowerThirdRatio: formatOptionalRatio(metrics.lowerThirdRatio),
        eyeGapRatio: formatOptionalRatio(metrics.eyeGapRatio),
        jawToCheekRatio: formatOptionalRatio(metrics.jawToCheekRatio),
        recommendedPresets: recommendedPresetLabels.join(' / '),
        exposurePlan: colorPlan.exposureCompensation,
        dimensions: assessment.dimensionAssessments.map((dimension) => `${dimension.label}:${dimension.summary}`).join('；'),
        suggestions: assessment.suggestions.join('；'),
      };
    });
}

function downloadReport(photos: PhotoItem[], fileName = 'photo-content-analysis-report.csv') {
  const rows = buildReportRows(photos);
  const header = [
    '文件名',
    '来源标记',
    '判断',
    '综合分',
    '分数段',
    '宽',
    '高',
    '亮度',
    '对比度',
    '暗部比例',
    '过曝比例',
    '倾斜角',
    '识别到的人脸数',
    '人脸识别路径',
    '眼部状态',
    '脸型倾向',
    '横向结构',
    '结构置信度',
    '脸部占比',
    '上庭比例',
    '中庭比例',
    '下庭比例',
    '眼距比例',
    '下颌比例',
    '推荐预设',
    '曝光微调',
    '多维评价',
    '改进建议',
  ];
  const csvRows = [
    header,
    ...rows.map((row) => [
      row.fileName,
      row.sourceLabel,
      row.decision,
      String(row.score),
      row.scoreBand,
      String(row.width),
      String(row.height),
      String(row.brightness),
      String(row.contrast),
      row.darkPixelRatio,
      row.brightPixelRatio,
      String(row.tiltDegrees),
      String(row.faceCount),
      row.faceDetectionMode,
      row.eyeStatus,
      row.faceShapeTendency,
      row.faceWidthTendency,
      row.faceStructureConfidence,
      row.faceSizeRatio,
      row.upperThirdRatio,
      row.midThirdRatio,
      row.lowerThirdRatio,
      row.eyeGapRatio,
      row.jawToCheekRatio,
      row.recommendedPresets,
      row.exposurePlan,
      row.dimensions,
      row.suggestions,
    ]),
  ];
  const csvContent = csvRows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');

  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);

  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

function downloadProcessingLog(logs: ProcessingLogEntry[]) {
  const header = ['文件名', '来源标记', '处理方案', '状态', '备注'];
  const rows = [
    header,
    ...logs.map((log) => [log.fileName, log.sourceLabel, log.presetLabel, log.status === 'success' ? '成功' : '失败', log.message]),
  ];
  const csvContent = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });

  triggerBlobDownload(blob, 'photo-processing-log.csv');
}

function downloadSourceManifest(targetPhotos: PhotoItem[], fileName: string) {
  const exportablePhotos = targetPhotos.filter((photo) => photo.assessment);

  if (exportablePhotos.length === 0) return;

  const rows = [
    ['文件名', '来源路径', '分数段', '综合分', '筛选状态'],
    ...exportablePhotos.map((photo) => [
      photo.fileName,
      photo.sourceLabel,
      getScoreBandLabel(photo.assessment?.score),
      String(photo.assessment?.score ?? ''),
      photo.assessment ? decisionMeta[photo.assessment.status].label : '',
    ]),
  ];
  const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });

  triggerBlobDownload(blob, fileName);
}

function getPrioritySuggestions(assessment?: PhotoAssessment) {
  if (!assessment) return [];

  const uniqueSuggestions = Array.from(new Set(assessment.suggestions));
  const actionableSuggestions = uniqueSuggestions.filter(
    (suggestion) =>
      !suggestion.startsWith('这张照片') &&
      !suggestion.startsWith('当前这张') &&
      !suggestion.startsWith('这一张') &&
      !suggestion.startsWith('当前画面'),
  );

  return (actionableSuggestions.length > 0 ? actionableSuggestions : uniqueSuggestions).slice(0, 3);
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
      <p>这一版会从构图、光影、曝光、暗部、人物状态和画面比例六个方向筛片，不再使用清晰度评分。</p>
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

async function pauseForDownloads(delayMs: number) {
  await new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function hasAssetForMode(photo: PhotoItem, mode: AssetViewMode) {
  if (mode === 'processed') {
    return Boolean(photo.processedPreviewUrl && photo.processedDownloadName);
  }

  if (mode === 'watermarked') {
    return Boolean(photo.watermarkedPreviewUrl && photo.watermarkedDownloadName);
  }

  return true;
}

function getPreviewUrlForMode(photo: PhotoItem, mode: AssetViewMode) {
  if (mode === 'processed') {
    return photo.processedPreviewUrl ?? photo.previewUrl;
  }

  if (mode === 'watermarked') {
    return photo.watermarkedPreviewUrl ?? photo.previewUrl;
  }

  return photo.previewUrl;
}

function getReadyCountForMode(photoList: PhotoItem[], mode: AssetViewMode) {
  return photoList.filter((photo) => hasAssetForMode(photo, mode)).length;
}

function getPendingCountForMode(photoList: PhotoItem[], mode: AssetViewMode) {
  return Math.max(photoList.length - getReadyCountForMode(photoList, mode), 0);
}

function buildWorkflowCopy(args: {
  totalCount: number;
  analyzedCount: number;
  retouchReadyCount: number;
  processedPendingCount: number;
  watermarkPendingCount: number;
}): WorkflowCopy {
  const { totalCount, analyzedCount, retouchReadyCount, processedPendingCount, watermarkPendingCount } = args;

  if (totalCount === 0) {
    return {
      title: '先导入一组照片，系统会自动开始分析。',
      note: '导入后会直接跑构图、人像、曝光、暗部和比例判断，你不用再手动点开始。',
    };
  }

  if (analyzedCount < totalCount) {
    return {
      title: '先等这一组分析跑完，再去挑精修候选。',
      note: '分析完成后优先看 80-100 分和精修候选，会比从全部照片里翻更快。',
    };
  }

  if (retouchReadyCount > 0 && processedPendingCount > 0) {
    return {
      title: '先看精修候选和 80-100 分，再做轻量调色。',
      note: '这条线最快，能先把值得修、值得交付的照片拉出来，不用整组一起硬做。',
    };
  }

  if (watermarkPendingCount > 0) {
    return {
      title: '调色副本已经够用了，可以顺手统一加水印导出。',
      note: '当前版会保留原图和处理日志，适合先出一版能交付的结果。',
    };
  }

  return {
    title: '这一组已经接近交付版，可以直接筛选、导出和复看。',
    note: '如果还想再精简，只要重点复看待修和表情复核的照片就够了。',
  };
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const resultsLayoutRef = useRef<HTMLElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const exportBarRef = useRef<HTMLDivElement | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [assetViewMode, setAssetViewMode] = useState<AssetViewMode>('original');
  const [activeDetailSection, setActiveDetailSection] = useState<DetailSectionKey>('portrait');
  const [unlockedDetailIndex, setUnlockedDetailIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [faceEngineStatus, setFaceEngineStatus] = useState<FaceEngineStatus>('loading');
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);
  const [isBatchColoring, setIsBatchColoring] = useState(false);
  const [isBatchWatermarking, setIsBatchWatermarking] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [processingLogs, setProcessingLogs] = useState<ProcessingLogEntry[]>([]);
  const [watermarkText, setWatermarkText] = useState('AI 摄影筛片');
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('bottom-right');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.22);

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

  useEffect(() => {
    if (!folderInputRef.current) return;

    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    setActiveDetailSection('portrait');
    setUnlockedDetailIndex(DETAIL_SECTION_ORDER.length - 1);
  }, [selectedPhotoId]);

  const completedAssessments = photos
    .map((photo) => photo.assessment)
    .filter((assessment): assessment is PhotoAssessment => Boolean(assessment));

  const singlePortraitCount = photos.filter((photo) => (photo.metrics?.faceCount ?? 0) === 1).length;
  const expressionReviewCount = photos.filter((photo) => {
    const balance = photo.metrics?.expressionBalance;
    return balance === 'needs_review' || balance === 'slight_asymmetry';
  }).length;
  const retouchReadyCount = photos.filter((photo) => photo.metrics?.retouchReadiness === 'ready').length;
  const summary = summarizeAssessments(completedAssessments);
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? photos[0];
  const visiblePhotos = useMemo(() => getPhotosForFilter(photos, activeFilter), [activeFilter, photos]);

  const selectedMetrics = selectedPhoto?.metrics;
  const selectedAssessment = selectedPhoto?.assessment;
  const portraitDimension = getDimension(selectedAssessment, 'portrait');
  const compositionDimension = getDimension(selectedAssessment, 'composition');
  const lightingDimension = getDimension(selectedAssessment, 'lighting');
  const exposureDimension = getDimension(selectedAssessment, 'exposure');
  const shadowDimension = getDimension(selectedAssessment, 'shadow');
  const ratioDimension = getDimension(selectedAssessment, 'ratio');
  const selectedColorPlan = selectedMetrics ? buildColorAdjustmentPlan(selectedMetrics) : null;
  const recommendedPresets = selectedColorPlan
    ? selectedColorPlan.recommendedPresetIds
        .map((presetId) => getPresetById(presetId))
        .filter((preset): preset is NonNullable<ReturnType<typeof getPresetById>> => Boolean(preset))
    : [];
  const preferredPreset = getPresetById(selectedPresetId ?? undefined) ?? recommendedPresets[0] ?? COLOR_PRESETS[0];
  const styleReference = selectedMetrics ? buildStyleReference(selectedMetrics) : null;
  const processedCount = photos.filter((photo) => Boolean(photo.processedPreviewUrl)).length;
  const watermarkedCount = photos.filter((photo) => Boolean(photo.watermarkedPreviewUrl)).length;
  const isOutputBusy = isBatchColoring || isBatchWatermarking;
  const score60To79Photos = useMemo(() => getPhotosForFilter(photos, 'score-60-79'), [photos]);
  const score80To100Photos = useMemo(() => getPhotosForFilter(photos, 'score-80-100'), [photos]);
  const hasRelativeSourcePath = selectedPhoto ? selectedPhoto.sourceLabel !== selectedPhoto.fileName : false;
  const selectedPreviewUrl = selectedPhoto ? getPreviewUrlForMode(selectedPhoto, assetViewMode) : null;
  const visibleReadyCount = useMemo(() => getReadyCountForMode(visiblePhotos, assetViewMode), [assetViewMode, visiblePhotos]);
  const visiblePendingCount = useMemo(() => getPendingCountForMode(visiblePhotos, assetViewMode), [assetViewMode, visiblePhotos]);
  const score60To79PendingCount = useMemo(() => getPendingCountForMode(score60To79Photos, assetViewMode), [assetViewMode, score60To79Photos]);
  const score80To100PendingCount = useMemo(() => getPendingCountForMode(score80To100Photos, assetViewMode), [assetViewMode, score80To100Photos]);
  const currentModeMeta = ASSET_VIEW_META[assetViewMode];
  const selectedModeReady = selectedPhoto ? hasAssetForMode(selectedPhoto, assetViewMode) : false;
  const analyzedPhotoCount = photos.filter((photo) => photo.status === 'done' && photo.metrics).length;
  const processedPendingCount = photos.filter((photo) => photo.status === 'done' && photo.metrics && !photo.processedPreviewUrl).length;
  const watermarkPendingCount = photos.filter((photo) => Boolean(photo.processedPreviewUrl) && !photo.watermarkedPreviewUrl).length;
  const prioritySuggestions = getPrioritySuggestions(selectedAssessment);
  const workflowCopy = buildWorkflowCopy({
    totalCount: photos.length,
    analyzedCount: analyzedPhotoCount,
    retouchReadyCount,
    processedPendingCount,
    watermarkPendingCount,
  });

  function openDetailSection(sectionKey: DetailSectionKey) {
    const nextIndex = DETAIL_SECTION_ORDER.indexOf(sectionKey);

    setUnlockedDetailIndex((currentIndex) => Math.max(currentIndex, nextIndex));
    setActiveDetailSection(sectionKey);
  }

  function advanceDetailSection(sectionKey: DetailSectionKey) {
    const currentIndex = DETAIL_SECTION_ORDER.indexOf(sectionKey);
    const nextSection = DETAIL_SECTION_ORDER[currentIndex + 1];

    if (!nextSection) return;

    setUnlockedDetailIndex((currentIndexValue) => Math.max(currentIndexValue, currentIndex + 1));
    setActiveDetailSection(nextSection);
  }

  function handlePresetSelection(presetId: string) {
    setSelectedPresetId(presetId);

    if (activeDetailSection === 'color') {
      advanceDetailSection('color');
    }
  }

  async function processColorForPhotos(targetPhotos: PhotoItem[]) {
    if (targetPhotos.length === 0) {
      setNoticeMessage('当前还没有可处理的照片。');
      return;
    }

    setIsBatchColoring(true);
    const nextLogs: ProcessingLogEntry[] = [];

    try {
      for (const photo of targetPhotos) {
        if (!photo.metrics) continue;

        const effectivePreset = getPresetById(selectedPresetId ?? undefined) ?? getPresetById(buildColorAdjustmentPlan(photo.metrics).recommendedPresetIds[0]);

        if (!effectivePreset) {
          nextLogs.push({
            photoId: photo.id,
            fileName: photo.fileName,
            presetLabel: '未找到预设',
            sourceLabel: photo.sourceLabel,
            status: 'error',
            message: '没有可用的调色预设。',
          });
          continue;
        }

        try {
          const settings = buildColorAdjustmentSettings(photo.metrics, effectivePreset.id);
          const processed = await generateColorAdjustedPhoto(photo.file, effectivePreset.label, settings);

          setPhotos((currentPhotos) =>
            currentPhotos.map((currentPhoto) => {
              if (currentPhoto.id !== photo.id) return currentPhoto;
              if (currentPhoto.processedPreviewUrl) {
                URL.revokeObjectURL(currentPhoto.processedPreviewUrl);
              }

              return {
                ...currentPhoto,
                processedPreviewUrl: processed.previewUrl,
                processedDownloadName: processed.fileName,
                processedPresetLabel: effectivePreset.label,
              };
            }),
          );

          nextLogs.push({
            photoId: photo.id,
            fileName: photo.fileName,
            presetLabel: effectivePreset.label,
            sourceLabel: photo.sourceLabel,
            status: 'success',
            message: '已生成调色副本。',
          });
        } catch (error) {
          nextLogs.push({
            photoId: photo.id,
            fileName: photo.fileName,
            presetLabel: effectivePreset.label,
            sourceLabel: photo.sourceLabel,
            status: 'error',
            message: error instanceof Error ? error.message : '鐢熸垚澶辫触',
          });
        }
      }

      setProcessingLogs(nextLogs);
      const successCount = nextLogs.filter((log) => log.status === 'success').length;
      setNoticeMessage(`已生成 ${successCount} 张调色副本，原图未覆盖。`);
    } finally {
      setIsBatchColoring(false);
    }
  }

  async function getWatermarkBasePhoto(photo: PhotoItem) {
    if (photo.processedPreviewUrl) {
      const response = await fetch(photo.processedPreviewUrl);

      if (!response.ok) {
        throw new Error('调色副本读取失败，请先重新生成。');
      }

      return {
        blob: await response.blob(),
        fileName: photo.processedDownloadName ?? photo.fileName,
      };
    }

    return {
      blob: photo.file,
      fileName: photo.fileName,
    };
  }

  async function processWatermarkForPhotos(targetPhotos: PhotoItem[]) {
    if (targetPhotos.length === 0) {
      setNoticeMessage('当前还没有可加水印的照片。');
      return;
    }

    const trimmedWatermarkText = watermarkText.trim();

    if (!trimmedWatermarkText) {
      setNoticeMessage('先写上要显示的水印文字。');
      return;
    }

    setIsBatchWatermarking(true);
    const nextLogs: ProcessingLogEntry[] = [];
    const watermarkLabel = `${trimmedWatermarkText} / ${WATERMARK_POSITION_META[watermarkPosition].label}`;

    try {
      for (const photo of targetPhotos) {
        try {
          const basePhoto = await getWatermarkBasePhoto(photo);
          const watermarked = await generateWatermarkedPhoto(basePhoto.blob, basePhoto.fileName, {
            text: trimmedWatermarkText,
            position: watermarkPosition,
            opacity: watermarkOpacity,
            scaleRatio: 0.032,
          });

          setPhotos((currentPhotos) =>
            currentPhotos.map((currentPhoto) => {
              if (currentPhoto.id !== photo.id) return currentPhoto;
              if (currentPhoto.watermarkedPreviewUrl) {
                URL.revokeObjectURL(currentPhoto.watermarkedPreviewUrl);
              }

              return {
                ...currentPhoto,
                watermarkedPreviewUrl: watermarked.previewUrl,
                watermarkedDownloadName: watermarked.fileName,
                watermarkLabel,
              };
            }),
          );

          nextLogs.push({
            photoId: photo.id,
            fileName: photo.fileName,
            presetLabel: watermarkLabel,
            sourceLabel: photo.sourceLabel,
            status: 'success',
            message: photo.processedPreviewUrl ? '已在调色副本上叠加水印。' : '已在原图副本上叠加水印。',
          });
        } catch (error) {
          nextLogs.push({
            photoId: photo.id,
            fileName: photo.fileName,
            presetLabel: watermarkLabel,
            sourceLabel: photo.sourceLabel,
            status: 'error',
            message: error instanceof Error ? error.message : '水印生成失败',
          });
        }
      }

      setProcessingLogs(nextLogs);
      const successCount = nextLogs.filter((log) => log.status === 'success').length;
      setNoticeMessage(`已生成 ${successCount} 张水印副本，原图保持不变。`);

      if (activeDetailSection === 'watermark' && successCount > 0) {
        advanceDetailSection('watermark');
      }
    } finally {
      setIsBatchWatermarking(false);
    }
  }

  async function processSelectedPhoto() {
    if (!selectedPhoto) return;
    await processColorForPhotos([selectedPhoto]);
  }

  async function processAllAnalyzedPhotos() {
    const analyzablePhotos = photos.filter((photo) => photo.status === 'done' && photo.metrics);
    await processColorForPhotos(analyzablePhotos);
  }

  async function processVisibleAnalyzedPhotos() {
    const analyzablePhotos = visiblePhotos.filter((photo) => photo.status === 'done' && photo.metrics);
    await processColorForPhotos(analyzablePhotos);
  }

  async function processSelectedWatermark() {
    if (!selectedPhoto) return;
    await processWatermarkForPhotos([selectedPhoto]);
  }

  async function processVisibleWatermarkPhotos() {
    await processWatermarkForPhotos(visiblePhotos);
  }

  async function processAllWatermarkPhotos() {
    await processWatermarkForPhotos(photos);
  }

  async function downloadSelectedProcessedPhoto() {
    if (!selectedPhoto?.processedPreviewUrl || !selectedPhoto.processedDownloadName) return;

    const response = await fetch(selectedPhoto.processedPreviewUrl);
    const blob = await response.blob();
    triggerBlobDownload(blob, selectedPhoto.processedDownloadName);
  }

  async function downloadAllProcessedPhotos() {
    const readyPhotos = photos.filter((photo) => photo.processedPreviewUrl && photo.processedDownloadName);

    if (readyPhotos.length === 0) {
      setNoticeMessage('还没有可下载的调色副本。');
      return;
    }

    for (const photo of readyPhotos) {
      const response = await fetch(photo.processedPreviewUrl!);
      const blob = await response.blob();
      triggerBlobDownload(blob, photo.processedDownloadName!);
      await pauseForDownloads(120);
    }

    setNoticeMessage(`已开始下载 ${readyPhotos.length} 张调色副本。`);
  }

  async function downloadSelectedWatermarkedPhoto() {
    if (!selectedPhoto?.watermarkedPreviewUrl || !selectedPhoto.watermarkedDownloadName) return;

    const response = await fetch(selectedPhoto.watermarkedPreviewUrl);
    const blob = await response.blob();
    triggerBlobDownload(blob, selectedPhoto.watermarkedDownloadName);
  }

  async function downloadAllWatermarkedPhotos() {
    const readyPhotos = photos.filter((photo) => photo.watermarkedPreviewUrl && photo.watermarkedDownloadName);

    if (readyPhotos.length === 0) {
      setNoticeMessage('还没有可下载的水印副本。');
      return;
    }

    for (const photo of readyPhotos) {
      const response = await fetch(photo.watermarkedPreviewUrl!);
      const blob = await response.blob();
      triggerBlobDownload(blob, photo.watermarkedDownloadName!);
      await pauseForDownloads(120);
    }

    setNoticeMessage(`已开始下载 ${readyPhotos.length} 张水印副本。`);
  }

  async function downloadOriginalPhotos(targetPhotos: PhotoItem[], label: string) {
    if (targetPhotos.length === 0) {
      setNoticeMessage(`${label}里还没有可导出的照片。`);
      return;
    }

    for (const photo of targetPhotos) {
      triggerBlobDownload(photo.file, photo.fileName);
      await pauseForDownloads(120);
    }

    setNoticeMessage(`已开始导出 ${targetPhotos.length} 张 ${label}原图副本，清晰度不变。`);
  }

  async function downloadPhotosByMode(targetPhotos: PhotoItem[], mode: AssetViewMode, label: string) {
    if (mode === 'original') {
      await downloadOriginalPhotos(targetPhotos, label);
      return;
    }

    const readyPhotos = targetPhotos.filter((photo) => hasAssetForMode(photo, mode));

    if (readyPhotos.length === 0) {
      setNoticeMessage(`${label}里还没有可导出的${ASSET_VIEW_META[mode].exportLabel}。`);
      return;
    }

    for (const photo of readyPhotos) {
      const assetUrl = mode === 'processed' ? photo.processedPreviewUrl : photo.watermarkedPreviewUrl;
      const assetName = mode === 'processed' ? photo.processedDownloadName : photo.watermarkedDownloadName;

      if (!assetUrl || !assetName) continue;

      const response = await fetch(assetUrl);
      const blob = await response.blob();
      triggerBlobDownload(blob, assetName);
      await pauseForDownloads(120);
    }

    setNoticeMessage(`已开始导出 ${readyPhotos.length} 张 ${label}${ASSET_VIEW_META[mode].exportLabel}。`);
  }

  async function processPhotosByMode(targetPhotos: PhotoItem[], mode: AssetViewMode, label: string) {
    if (mode === 'original') {
      setNoticeMessage(`${label}当前还是原图模式，切到调色副本或水印副本后再继续批量处理。`);
      return;
    }

    if (mode === 'processed') {
      const analyzablePhotos = targetPhotos.filter((photo) => photo.status === 'done' && photo.metrics);

      if (analyzablePhotos.length === 0) {
        setNoticeMessage(`${label}里还没有可继续生成调色副本的照片。`);
        return;
      }

      await processColorForPhotos(analyzablePhotos);
      return;
    }

    if (targetPhotos.length === 0) {
      setNoticeMessage(`${label}里还没有可继续生成水印副本的照片。`);
      return;
    }

    await processWatermarkForPhotos(targetPhotos);
  }

  async function copySourceLabels(targetPhotos: PhotoItem[], label: string) {
    if (targetPhotos.length === 0) {
      setNoticeMessage(`${label}里还没有可复制的路径。`);
      return;
    }

    const text = targetPhotos.map((photo) => photo.sourceLabel).join('\n');

    if (!navigator.clipboard?.writeText) {
      setNoticeMessage('当前浏览器暂时不支持直接复制路径。');
      return;
    }

    await navigator.clipboard.writeText(text);
    setNoticeMessage(`已复制 ${targetPhotos.length} 条 ${label}路径。`);
  }

  function focusFilter(filterValue: FilterValue) {
    const targetPhotos = getPhotosForFilter(photos, filterValue);

    setActiveFilter(filterValue);

    if (targetPhotos[0]) {
      setSelectedPhotoId(targetPhotos[0].id);
    }
  }

  function scrollToWorkspace(target: 'results' | 'detail' | 'export') {
    window.requestAnimationFrame(() => {
      const targetElement = target === 'detail' ? detailPanelRef.current : target === 'export' ? exportBarRef.current : resultsLayoutRef.current;
      targetElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function handleHomeShortcut(shortcut: WorkspaceShortcut) {
    const plan = getWorkspaceShortcutPlan(shortcut);

    if (plan.filter) {
      focusFilter(plan.filter);
    } else if (photos[0]) {
      setSelectedPhotoId(photos[0].id);
    }

    if (plan.assetViewMode) {
      setAssetViewMode(plan.assetViewMode);
    }

    if (plan.detailSection) {
      openDetailSection(plan.detailSection);
    }

    scrollToWorkspace(plan.target);
  }

  async function loadDemoAndEnterWorkspace() {
    await loadDemoPortraits();
    scrollToWorkspace('results');
  }

  function isDetailSectionVisible(sectionKey: DetailSectionKey) {
    return DETAIL_SECTION_ORDER.indexOf(sectionKey) <= unlockedDetailIndex;
  }

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
      file,
      fileName: file.name,
      sourceLabel: 'webkitRelativePath' in file && file.webkitRelativePath ? file.webkitRelativePath : file.name,
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
    scrollToWorkspace('results');
  }

  async function loadDemoPortraits() {
    setIsLoadingSamples(true);
    setNoticeMessage(null);

    try {
      const demoFiles = await Promise.all(DEMO_PORTRAITS.map((sample) => buildDemoFile(sample)));
      handleFiles(demoFiles);
      setNoticeMessage('已载入两张示例人像，你可以直接查看单人脸识别、修脸建议和预设推荐。');
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

  function handleFolderInputChange(event: ChangeEvent<HTMLInputElement>) {
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
    photos.forEach((photo) => {
      URL.revokeObjectURL(photo.previewUrl);

      if (photo.processedPreviewUrl) {
        URL.revokeObjectURL(photo.processedPreviewUrl);
      }

      if (photo.watermarkedPreviewUrl) {
        URL.revokeObjectURL(photo.watermarkedPreviewUrl);
      }
    });
    setPhotos([]);
    setSelectedPhotoId(null);
    setActiveFilter('all');
    setSelectedPresetId(null);
    setProcessingLogs([]);
    setNoticeMessage(null);
  }

  return (
    <main className="app-shell">
      <section className="reference-dashboard" aria-label="AI 摄影筛片助手工作台">
        <img src={REFERENCE_DASHBOARD_IMAGE} alt="AI 摄影筛片助手工作台参考界面" />
        <div className="reference-hotspots">
          <button className="reference-hotspot upload" type="button" onClick={() => folderInputRef.current?.click()} aria-label="上传照片或文件夹" />
          <button className="reference-hotspot demo" type="button" onClick={() => void loadDemoAndEnterWorkspace()} aria-label="加载示例人像" />
          <button className="reference-hotspot export" type="button" onClick={() => handleHomeShortcut('export')} aria-label="导出报告" />
          <button className="reference-hotspot face" type="button" onClick={() => handleHomeShortcut('face')} aria-label="人脸分析" />
          <button className="reference-hotspot retouch" type="button" onClick={() => handleHomeShortcut('retouch')} aria-label="修图建议" />
          <button className="reference-hotspot color" type="button" onClick={() => handleHomeShortcut('color')} aria-label="批量调色" />
          <button className="reference-hotspot watermark" type="button" onClick={() => handleHomeShortcut('watermark')} aria-label="批量水印" />
          <button className="reference-hotspot report" type="button" onClick={() => handleHomeShortcut('export')} aria-label="导出报告" />
        </div>
      </section>

      <section className="reference-mobile-actions" aria-label="移动端快捷操作">
        <button type="button" onClick={() => folderInputRef.current?.click()}><Upload aria-hidden="true" size={18} />上传照片 / 文件夹</button>
        <button type="button" onClick={() => void loadDemoAndEnterWorkspace()}><Image aria-hidden="true" size={18} />加载示例人像</button>
        <button type="button" onClick={() => handleHomeShortcut('retouch')}><Wrench aria-hidden="true" size={18} />修图建议</button>
        <button type="button" onClick={() => handleHomeShortcut('color')}><Palette aria-hidden="true" size={18} />批量调色</button>
      </section>

      <section className="workspace-header">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Camera aria-hidden="true" size={19} />
          </span>
          <span>AI 摄影筛片助手</span>
          <span className="brand-tier">专业版</span>
        </div>

        <nav className="workspace-nav" aria-label="主导航">
          <span className="is-active"><Aperture aria-hidden="true" size={16} />工作台</span>
          <span><Image aria-hidden="true" size={16} />相册管理</span>
          <span><ScanFace aria-hidden="true" size={16} />人脸分析</span>
          <span><Wrench aria-hidden="true" size={16} />工具箱</span>
          <span><Settings aria-hidden="true" size={16} />设置</span>
        </nav>

        <div className="header-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => downloadReport(photos)}
            disabled={summary.totalCount === 0}
          >
            <Download aria-hidden="true" size={17} />
            导出报告
          </button>
          <button className="icon-button" type="button" onClick={clearPhotos} disabled={photos.length === 0} aria-label="清空照片">
            <Trash2 aria-hidden="true" size={18} />
          </button>
        </div>
      </section>

      <section className="hero-workspace">
        <section className="hero-copy-panel">
          <div className="hero-portrait" aria-hidden="true" />
          <div className="hero-copy-content">
            <span className="hero-kicker">更智能 · 更高效 · 更专业</span>
            <h1>AI 让每一张<br />人像都更出色</h1>
            <p>智能分析构图、光影、表情与细节，精准筛选优质照片，给出专业修图建议。</p>
            <div className="hero-actions">
              <button className="hero-upload-button" type="button" onClick={() => folderInputRef.current?.click()}>
                <Upload aria-hidden="true" size={19} />
                上传照片 / 文件夹
              </button>
              <button className="hero-demo-button" type="button" onClick={() => void loadDemoPortraits()} disabled={isLoadingSamples}>
                {isLoadingSamples ? <Loader2 aria-hidden="true" size={19} /> : <Image aria-hidden="true" size={19} />}
                {isLoadingSamples ? '载入示例中' : '加载示例人像'}
              </button>
            </div>
            <div className="hero-privacy-note">
              <Info aria-hidden="true" size={15} />
              本地处理 · 隐私安全 · 无需联网
            </div>
            <span className="creator-signature">麦田里的修猫</span>
          </div>
          <input className="hidden-file-input" ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleInputChange} />
          <input className="hidden-file-input" ref={folderInputRef} type="file" accept="image/*" multiple onChange={handleFolderInputChange} />
        </section>

        <div className="summary-panel" aria-label="筛片统计">
          <div className="summary-heading">
            <span><Aperture aria-hidden="true" size={18} />今日分析概览</span>
            <small>全部相册</small>
          </div>
          <MetricPill label="已分析" value={summary.totalCount} />
          <MetricPill label="优质照片" value={summary.keepCount} />
          <MetricPill label="待优化照片" value={summary.reviewCount} />
          <MetricPill label="一般照片" value={summary.rejectCount} />
          <MetricPill label="闭眼 / 表情差" value={expressionReviewCount} />
          <MetricPill label="构图问题" value={retouchReadyCount} />
          <div className="summary-performance">
            <div className="score-meter">
              <span>综合评分</span>
              <strong>{summary.averageScore}</strong>
              <small>/ 100</small>
            </div>
            <div className="trend-card">
              <div className="trend-card-heading">
                <strong>评分趋势（近7天）</strong>
                <span>近7天</span>
              </div>
              <div className="trend-bars" aria-label="近七天评分趋势">
                {[64, 72, 69, 58, 62, 76, 82].map((score, index) => (
                  <i key={index} style={{ '--trend-height': `${score}%` } as CSSProperties} />
                ))}
              </div>
            </div>
          </div>
          <div className="summary-quick-actions">
            <button type="button" onClick={() => focusFilter('expression-review')}><ScanFace aria-hidden="true" size={18} />人脸分析</button>
            <button type="button" onClick={() => focusFilter('retouch-ready')}><Wrench aria-hidden="true" size={18} />修图建议</button>
            <button type="button" onClick={() => setAssetViewMode('processed')}><Palette aria-hidden="true" size={18} />批量调色</button>
            <button type="button" onClick={() => setAssetViewMode('watermarked')}><FileText aria-hidden="true" size={18} />批量水印</button>
            <button type="button" onClick={() => downloadReport(photos)} disabled={summary.totalCount === 0}><Download aria-hidden="true" size={18} />导出报告</button>
          </div>
        </div>
      </section>

      <section className="feature-strip" aria-label="核心能力">
        <div><Aperture aria-hidden="true" size={27} /><span><strong>多维度智能分析</strong><small>构图、光影、曝光、表情、清晰度等多维综合评估</small></span></div>
        <div><ScanFace aria-hidden="true" size={27} /><span><strong>专业修图建议</strong><small>基于 AI 人脸识别与结构分析，提供精准修图与塑形建议</small></span></div>
        <div><Palette aria-hidden="true" size={27} /><span><strong>批量处理工具</strong><small>批量调色、统一风格、智能水印，高效处理大量照片</small></span></div>
        <div><CheckCircle2 aria-hidden="true" size={27} /><span><strong>隐私安全保障</strong><small>本地运行，照片不上传，守护您的隐私安全</small></span></div>
      </section>

      <section className="results-layout" ref={resultsLayoutRef}>
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
              查看全部
            </button>
          </div>

          <div className="workflow-rail">
            <div className="workflow-copy">
              <span className="workflow-kicker">本组下一步</span>
              <strong>{workflowCopy.title}</strong>
              <p>{workflowCopy.note}</p>
            </div>
            <div className="workflow-actions">
              <button className="ghost-button" type="button" onClick={() => focusFilter('retouch-ready')} disabled={retouchReadyCount === 0}>
                <Wrench aria-hidden="true" size={16} />
                精修候选 {retouchReadyCount}
              </button>
              <button className="ghost-button" type="button" onClick={() => focusFilter('score-80-100')} disabled={score80To100Photos.length === 0}>
                <CheckCircle2 aria-hidden="true" size={16} />
                80-100 分 {score80To100Photos.length}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setAssetViewMode('processed');
                  void processPhotosByMode(visiblePhotos, 'processed', '当前筛选');
                }}
                disabled={isOutputBusy || visiblePhotos.length === 0}
              >
                <Palette aria-hidden="true" size={16} />
                当前筛选调色
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setAssetViewMode('watermarked');
                  void processPhotosByMode(visiblePhotos, 'watermarked', '当前筛选');
                }}
                disabled={isOutputBusy || visiblePhotos.length === 0}
              >
                <FileText aria-hidden="true" size={16} />
                当前筛选水印
              </button>
            </div>
          </div>

          <div className="quick-export-bar" ref={exportBarRef}>
            <div className="quick-export-modes">
              <strong>当前查看版本</strong>
              <div className="segmented-row compact">
                {(Object.keys(ASSET_VIEW_META) as AssetViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`segment-button ${assetViewMode === mode ? 'is-selected' : ''}`}
                    onClick={() => setAssetViewMode(mode)}
                  >
                    {ASSET_VIEW_META[mode].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="action-row">
              <button className="ghost-button" type="button" onClick={() => void downloadPhotosByMode(visiblePhotos, assetViewMode, '当前筛选')}>
                <Download aria-hidden="true" size={16} />
                导出当前内容
              </button>
              <button className="ghost-button" type="button" onClick={() => void downloadPhotosByMode(score60To79Photos, assetViewMode, '60-79 分')}>
                <Download aria-hidden="true" size={16} />
                导出 60-79
              </button>
              <button className="ghost-button" type="button" onClick={() => void downloadPhotosByMode(score80To100Photos, assetViewMode, '80-100 分')}>
                <Download aria-hidden="true" size={16} />
                导出 80-100
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => downloadSourceManifest(visiblePhotos, `photo-source-manifest-${activeFilter}.csv`)}
                disabled={visiblePhotos.length === 0}
              >
                <FileText aria-hidden="true" size={16} />
                导出路径清单
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void copySourceLabels(visiblePhotos, '当前筛选')}
                disabled={visiblePhotos.length === 0}
              >
                <FileText aria-hidden="true" size={16} />
                复制当前路径
              </button>
            </div>

            {assetViewMode === 'original' ? (
              <div className="quick-export-note">
                <p>切到调色副本或水印副本后，这里就能直接对当前筛选、60-79、80-100 继续整组处理。</p>
              </div>
            ) : (
              <>
                <div className="action-row">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void processPhotosByMode(visiblePhotos, assetViewMode, '当前筛选')}
                    disabled={isOutputBusy || visiblePhotos.length === 0}
                  >
                    {isOutputBusy ? <Loader2 aria-hidden="true" size={16} /> : assetViewMode === 'watermarked' ? <FileText aria-hidden="true" size={16} /> : <Palette aria-hidden="true" size={16} />}
                    处理当前筛选
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void processPhotosByMode(score60To79Photos, assetViewMode, '60-79 分')}
                    disabled={isOutputBusy || score60To79Photos.length === 0}
                  >
                    {isOutputBusy ? <Loader2 aria-hidden="true" size={16} /> : assetViewMode === 'watermarked' ? <FileText aria-hidden="true" size={16} /> : <Palette aria-hidden="true" size={16} />}
                    处理 60-79
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void processPhotosByMode(score80To100Photos, assetViewMode, '80-100 分')}
                    disabled={isOutputBusy || score80To100Photos.length === 0}
                  >
                    {isOutputBusy ? <Loader2 aria-hidden="true" size={16} /> : assetViewMode === 'watermarked' ? <FileText aria-hidden="true" size={16} /> : <Palette aria-hidden="true" size={16} />}
                    处理 80-100
                  </button>
                </div>
                <div className="mode-progress-row" aria-label="current mode remaining progress">
                  <span className="mode-progress-chip">当前筛选剩余 {visiblePendingCount}</span>
                  <span className="mode-progress-chip">60-79 剩余 {score60To79PendingCount}</span>
                  <span className="mode-progress-chip">80-100 剩余 {score80To100PendingCount}</span>
                </div>
              </>
            )}

            {selectedPhoto ? (
              <div className="quick-export-meta">
                <strong>{currentModeMeta.label}</strong>
                <code>{selectedPhoto.sourceLabel}</code>
                <span>
                  {selectedModeReady
                    ? `当前筛选里已有 ${visibleReadyCount} 张可直接调用的${currentModeMeta.label}。`
                    : `${currentModeMeta.label}还没生成时，会先回退显示原图。`}
                </span>
                <span>{hasRelativeSourcePath ? '已保留相对路径' : '当前仅记录文件名'}</span>
              </div>
            ) : null}
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
                    <img src={getPreviewUrlForMode(photo, assetViewMode)} alt={photo.fileName} />
                    <span className={`asset-mode-chip ${hasAssetForMode(photo, assetViewMode) ? 'is-ready' : 'is-fallback'}`}>
                      {assetViewMode === 'original' ? '原图' : hasAssetForMode(photo, assetViewMode) ? ASSET_VIEW_META[assetViewMode].label : '原图回退'}
                    </span>
                    {photo.status === 'analyzing' ? (
                      <span className="analysis-state">
                        <Loader2 aria-hidden="true" size={16} />
                        分析中
                      </span>
                    ) : null}
                  </span>
                  <span className="photo-card-body">
                    <span className="file-name">{photo.fileName}</span>
                    <span className="file-meta">
                      {formatFileSize(photo.fileSize)} · {photo.assessment ? getScoreBandLabel(photo.assessment.score) : '待完成'}
                    </span>
                    {photo.metrics ? (
                      <span className="list-signal-row">
                        <span className={`list-signal-chip tone-${getExpressionListChip(photo.metrics).tone}`}>
                          {getExpressionListChip(photo.metrics).label}
                        </span>
                        <span className={`list-signal-chip tone-${getRetouchListChip(photo.metrics).tone}`}>
                          {getRetouchListChip(photo.metrics).label}
                        </span>
                      </span>
                    ) : null}
                    {photo.assessment ? <DecisionBadge decision={photo.assessment.status} /> : null}
                    {photo.status === 'error' ? <span className="error-text">{photo.errorMessage}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="detail-panel" ref={detailPanelRef} aria-label="照片分析详情">
          {selectedPhoto ? (
            <>
              <div className="detail-media">
                <img src={selectedPreviewUrl ?? selectedPhoto.previewUrl} alt={selectedPhoto.fileName} />
              </div>

              <div className="detail-content">
                <div className="detail-heading">
                  <div>
                    <span>当前照片</span>
                    <h2>{selectedPhoto.fileName}</h2>
                    <span className="detail-mode-note">
                      {selectedModeReady || assetViewMode === 'original'
                        ? `当前查看：${currentModeMeta.label}`
                        : `当前查看：原图回退，${currentModeMeta.label}尚未生成。`}
                    </span>
                  </div>
                  {selectedAssessment ? <DecisionBadge decision={selectedAssessment.status} /> : null}
                </div>

                {selectedAssessment && selectedMetrics ? (
                  <>
                    <div className="quality-score">
                      <span>综合分</span>
                      <strong>{selectedAssessment.score}</strong>
                    </div>

                    {prioritySuggestions.length > 0 ? (
                      <div className="priority-brief">
                        <div className="priority-brief-header">
                          <strong>先处理这几项</strong>
                          <span>
                            {decisionMeta[selectedAssessment.status].label} · {getScoreBandLabel(selectedAssessment.score)}
                          </span>
                        </div>
                        <ul>
                          {prioritySuggestions.map((suggestion) => (
                            <li key={suggestion}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {isDetailSectionVisible('portrait') ? (
                      <section className={`detail-step ${activeDetailSection === 'portrait' ? 'is-active' : 'is-collapsed'}`}>
                        <button className="detail-step-header" type="button" onClick={() => openDetailSection('portrait')}>
                          <span className="block-title">
                            <ScanFace aria-hidden="true" size={17} />
                            人像建议
                          </span>
                          <ChevronRight aria-hidden="true" size={16} />
                        </button>
                        {activeDetailSection === 'portrait' ? (
                          <div className="detail-step-content">
                            <div className="metric-grid">
                              <MetricPill label="识别人脸数" value={selectedMetrics.faceCount ?? 0} />
                              <MetricPill label="识别路径" value={describeFaceDetectionMode(selectedMetrics.faceDetectionMode)} />
                              <MetricPill label="眼部状态" value={describeEyeStatus(selectedMetrics.eyeStatus)} />
                              <MetricPill label="表情稳定度" value={describeExpressionBalance(selectedMetrics.expressionBalance)} />
                              <MetricPill label="精修准备度" value={describeRetouchReadiness(selectedMetrics.retouchReadiness)} />
                              <MetricPill label="脸型倾向" value={describeFaceShapeTendency(selectedMetrics.faceShapeTendency)} />
                              <MetricPill label="横向结构" value={describeFaceWidthTendency(selectedMetrics.faceWidthTendency)} />
                              <MetricPill label="结构置信度" value={describeFaceStructureConfidence(selectedMetrics.faceStructureConfidence)} />
                              <MetricPill label="脸部占比" value={formatOptionalPercent(selectedMetrics.faceSizeRatio)} />
                              <MetricPill label="眼距比例" value={formatOptionalRatio(selectedMetrics.eyeGapRatio)} />
                            </div>
                            {portraitDimension ? (
                              <div className="single-dimension">
                                <DimensionCard dimension={portraitDimension} />
                              </div>
                            ) : null}
                            <div className="note-stack">
                              <p>{buildFaceFramingNote(selectedMetrics)}</p>
                              <p>{buildFaceStructureNotes(selectedMetrics)}</p>
                              <p>{buildFaceDetectionReadinessNote(selectedMetrics)}</p>
                              <p>{buildExpressionReviewNote(selectedMetrics)}</p>
                              <p>{buildRetouchReadinessNote(selectedMetrics)}</p>
                              <p>{buildFaceReferenceSummary(selectedMetrics)}</p>
                              <p>
                                上庭 {formatOptionalRatio(selectedMetrics.upperThirdRatio)}，中庭 {formatOptionalRatio(selectedMetrics.midThirdRatio)}，
                                下庭 {formatOptionalRatio(selectedMetrics.lowerThirdRatio)}，下颌比值 {formatOptionalRatio(selectedMetrics.jawToCheekRatio)}。
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {isDetailSectionVisible('style') ? (
                      <section className={`detail-step ${activeDetailSection === 'style' ? 'is-active' : 'is-collapsed'}`}>
                        <button className="detail-step-header" type="button" onClick={() => openDetailSection('style')}>
                          <span className="block-title">
                            <Aperture aria-hidden="true" size={17} />
                            构图与风格
                          </span>
                          <ChevronRight aria-hidden="true" size={16} />
                        </button>
                        {activeDetailSection === 'style' ? (
                          <div className="detail-step-content">
                            <div className="dimension-grid">
                              {compositionDimension ? <DimensionCard dimension={compositionDimension} /> : null}
                              {lightingDimension ? <DimensionCard dimension={lightingDimension} /> : null}
                              {ratioDimension ? <DimensionCard dimension={ratioDimension} /> : null}
                            </div>
                            {styleReference ? (
                              <div className="style-reference">
                                <strong>{styleReference.title}</strong>
                                <p>{styleReference.note}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {isDetailSectionVisible('color') ? (
                      <section className={`detail-step ${activeDetailSection === 'color' ? 'is-active' : 'is-collapsed'}`}>
                        <button className="detail-step-header" type="button" onClick={() => openDetailSection('color')}>
                          <span className="block-title">
                            <Palette aria-hidden="true" size={17} />
                            调色预设
                          </span>
                          <ChevronRight aria-hidden="true" size={16} />
                        </button>
                        {activeDetailSection === 'color' ? (
                          <div className="detail-step-content">
                            <div className="dimension-grid">
                              {exposureDimension ? <DimensionCard dimension={exposureDimension} /> : null}
                              {shadowDimension ? <DimensionCard dimension={shadowDimension} /> : null}
                            </div>
                            {selectedColorPlan ? (
                              <div className="color-plan">
                                <div className="color-plan-grid">
                                  <MetricPill label="曝光微调" value={selectedColorPlan.exposureCompensation} />
                                  <MetricPill label="高光建议" value={selectedColorPlan.highlightAdjustment} />
                                  <MetricPill label="暗部建议" value={selectedColorPlan.shadowAdjustment} />
                                  <MetricPill label="建议预设" value={preferredPreset.label} />
                                </div>
                                <div className="note-stack">
                                  <p>{selectedColorPlan.whiteBalanceNote}</p>
                                  <p>{selectedColorPlan.skinToneGoal}</p>
                                </div>

                                <div className="action-row">
                                  <button className="ghost-button" type="button" onClick={() => void processSelectedPhoto()} disabled={isOutputBusy}>
                                    {isBatchColoring ? <Loader2 aria-hidden="true" size={16} /> : <Palette aria-hidden="true" size={16} />}
                                    生成当前副本
                                  </button>
                                  <button className="ghost-button" type="button" onClick={() => void processVisibleAnalyzedPhotos()} disabled={isOutputBusy}>
                                    {isBatchColoring ? <Loader2 aria-hidden="true" size={16} /> : <Palette aria-hidden="true" size={16} />}
                                    处理当前筛选
                                  </button>
                                  <button className="ghost-button" type="button" onClick={() => void processAllAnalyzedPhotos()} disabled={isOutputBusy}>
                                    {isBatchColoring ? <Loader2 aria-hidden="true" size={16} /> : <Palette aria-hidden="true" size={16} />}
                                    批量生成全部
                                  </button>
                                </div>

                                <div className="preset-section">
                                  <strong>推荐预设</strong>
                                  <div className="preset-grid">
                                    {recommendedPresets.map((preset) => (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        className={`preset-card ${preferredPreset.id === preset.id ? 'is-selected' : ''}`}
                                        onClick={() => handlePresetSelection(preset.id)}
                                      >
                                        <span>{preset.label}</span>
                                        <small>{preset.summary}</small>
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="preset-section">
                                  <strong>全部预设库</strong>
                                  <div className="preset-grid compact">
                                    {COLOR_PRESETS.map((preset) => (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        className={`preset-card ${preferredPreset.id === preset.id ? 'is-selected' : ''}`}
                                        onClick={() => handlePresetSelection(preset.id)}
                                      >
                                        <span>{preset.label}</span>
                                        <small>{preset.fileName}</small>
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="note-stack">
                                  {selectedColorPlan.notes.map((note) => (
                                    <p key={note}>{note}</p>
                                  ))}
                                  <p>当前选中的预设仅作为后续批量调色参考，不会覆盖原图。</p>
                                </div>

                                {selectedPhoto.processedPreviewUrl ? (
                                  <div className="processed-preview">
                                    <div className="processed-preview-media">
                                      <img src={selectedPhoto.processedPreviewUrl} alt={`${selectedPhoto.fileName} 调色副本`} />
                                    </div>
                                    <div className="processed-preview-body">
                                      <strong>当前调色副本</strong>
                                      <p>已按 {selectedPhoto.processedPresetLabel ?? preferredPreset.label} 生成新的输出版本，原图保持不变。</p>
                                      <div className="action-row">
                                        <button className="ghost-button" type="button" onClick={() => void downloadSelectedProcessedPhoto()}>
                                          <Download aria-hidden="true" size={16} />
                                          下载当前副本
                                        </button>
                                        <button
                                          className="ghost-button"
                                          type="button"
                                          onClick={() => void downloadAllProcessedPhotos()}
                                          disabled={processedCount === 0}
                                        >
                                          <Download aria-hidden="true" size={16} />
                                          下载全部副本
                                        </button>
                                        <button
                                          className="ghost-button"
                                          type="button"
                                          onClick={() => downloadProcessingLog(processingLogs)}
                                          disabled={processingLogs.length === 0}
                                        >
                                          <FileText aria-hidden="true" size={16} />
                                          导出处理日志
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {isDetailSectionVisible('export') ? (
                      <section className={`detail-step ${activeDetailSection === 'export' ? 'is-active' : 'is-collapsed'}`}>
                        <button className="detail-step-header" type="button" onClick={() => openDetailSection('export')}>
                          <span className="block-title">
                            <Download aria-hidden="true" size={17} />
                            导出信息
                          </span>
                          <ChevronRight aria-hidden="true" size={16} />
                        </button>
                        {activeDetailSection === 'export' ? (
                          <div className="detail-step-content">
                            <div className="metric-grid">
                              <MetricPill label="当前分数段" value={getScoreBandLabel(selectedAssessment.score)} />
                              <MetricPill label="来源标记" value={selectedPhoto.sourceLabel} />
                              <MetricPill label="推荐状态" value={decisionMeta[selectedAssessment.status].label} />
                              <MetricPill label="原图策略" value="只做分析，不覆盖" />
                            </div>
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {isDetailSectionVisible('watermark') ? (
                      <section className={`detail-step ${activeDetailSection === 'watermark' ? 'is-active' : 'is-collapsed'}`}>
                        <button className="detail-step-header" type="button" onClick={() => openDetailSection('watermark')}>
                          <span className="block-title">
                            <FileText aria-hidden="true" size={17} />
                            批量水印
                          </span>
                          <ChevronRight aria-hidden="true" size={16} />
                        </button>
                        {activeDetailSection === 'watermark' ? (
                          <div className="detail-step-content">
                            <div className="watermark-controls">
                              <label className="watermark-field">
                                <span>水印文字</span>
                                <input
                                  type="text"
                                  value={watermarkText}
                                  onChange={(event) => setWatermarkText(event.target.value)}
                                  placeholder="输入统一显示的水印文字"
                                />
                              </label>

                              <div className="watermark-field">
                                <span>位置</span>
                                <div className="segmented-row">
                                  {Object.entries(WATERMARK_POSITION_META).map(([positionKey, meta]) => (
                                    <button
                                      key={positionKey}
                                      type="button"
                                      className={`segment-button ${watermarkPosition === positionKey ? 'is-selected' : ''}`}
                                      onClick={() => setWatermarkPosition(positionKey as WatermarkPosition)}
                                    >
                                      {meta.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <label className="watermark-field">
                                <span>透明度 {Math.round(watermarkOpacity * 100)}%</span>
                                <input
                                  className="range-input"
                                  type="range"
                                  min="0.12"
                                  max="0.36"
                                  step="0.02"
                                  value={watermarkOpacity}
                                  onChange={(event) => setWatermarkOpacity(Number(event.target.value))}
                                />
                              </label>
                            </div>

                            <div className="action-row">
                              <button className="ghost-button" type="button" onClick={() => void processSelectedWatermark()} disabled={isOutputBusy}>
                                {isBatchWatermarking ? <Loader2 aria-hidden="true" size={16} /> : <FileText aria-hidden="true" size={16} />}
                                生成当前水印
                              </button>
                              <button className="ghost-button" type="button" onClick={() => void processVisibleWatermarkPhotos()} disabled={isOutputBusy}>
                                {isBatchWatermarking ? <Loader2 aria-hidden="true" size={16} /> : <FileText aria-hidden="true" size={16} />}
                                处理当前筛选
                              </button>
                              <button className="ghost-button" type="button" onClick={() => void processAllWatermarkPhotos()} disabled={isOutputBusy}>
                                {isBatchWatermarking ? <Loader2 aria-hidden="true" size={16} /> : <FileText aria-hidden="true" size={16} />}
                                批量生成全部
                              </button>
                            </div>

                            {selectedPhoto.watermarkedPreviewUrl ? (
                              <div className="processed-preview">
                                <div className="processed-preview-media">
                                  <img src={selectedPhoto.watermarkedPreviewUrl} alt={`${selectedPhoto.fileName} 水印副本`} />
                                </div>
                                <div className="processed-preview-body">
                                  <strong>当前水印副本</strong>
                                  <p>已按 {selectedPhoto.watermarkLabel ?? watermarkText} 生成新的输出版本，原图和调色副本都保持不变。</p>
                                  <div className="action-row">
                                    <button className="ghost-button" type="button" onClick={() => void downloadSelectedWatermarkedPhoto()}>
                                      <Download aria-hidden="true" size={16} />
                                      下载当前水印
                                    </button>
                                    <button
                                      className="ghost-button"
                                      type="button"
                                      onClick={() => void downloadAllWatermarkedPhotos()}
                                      disabled={watermarkedCount === 0}
                                    >
                                      <Download aria-hidden="true" size={16} />
                                      下载全部水印
                                    </button>
                                    <button
                                      className="ghost-button"
                                      type="button"
                                      onClick={() => downloadProcessingLog(processingLogs)}
                                      disabled={processingLogs.length === 0}
                                    >
                                      <FileText aria-hidden="true" size={16} />
                                      导出处理日志
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="note-stack">
                              <p>如果你已经先做了调色，这里会直接沿用调色后的副本继续输出，减少重复操作。</p>
                            </div>
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {isDetailSectionVisible('summary') ? (
                      <section className={`detail-step ${activeDetailSection === 'summary' ? 'is-active' : 'is-collapsed'}`}>
                        <button className="detail-step-header" type="button" onClick={() => openDetailSection('summary')}>
                          <span className="block-title">
                            <Wrench aria-hidden="true" size={17} />
                            综合建议
                          </span>
                          <ChevronRight aria-hidden="true" size={16} />
                        </button>
                        {activeDetailSection === 'summary' ? (
                          <div className="detail-step-content">
                            <ul className="suggestion-list">
                              {selectedAssessment.suggestions.slice(0, 16).map((suggestion) => (
                                <li key={suggestion}>{suggestion}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </section>
                    ) : null}
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
              <p>选中一张照片后，这里会自然展开对应的分析结果和可用操作。</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

export default App;
