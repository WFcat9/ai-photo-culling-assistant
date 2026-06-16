import type { ReactNode } from 'react';

type GalleryPhoto = {
  title: string;
  category: string;
  image: string;
  note: string;
};

type CaseStudy = {
  title: string;
  label: string;
  image: string;
  summary: string;
  planning: string;
  shooting: string;
  editing: string;
};

const assetPath = '/portfolio/';

const operationProofs = [
  { value: '300+', label: '校园活动参与' },
  { value: '50+', label: 'UGC 内容产出' },
  { value: '10w+', label: '爆款内容播放' },
  { value: '1.8x', label: '账号互动率表现' },
];

const operationHighlights = [
  '策划 vivo 影像科技校园行等 3 场活动，联动摄影协会完成校园传播。',
  '运营 3 个垂直社群，发起影像创作大赛并沉淀 50+ 条 UGC 内容。',
  '从 0 到 1 搭建摄影工作室抖音/小红书账号，结合热点和场景内容带动转化。',
];

const caseStudies: CaseStudy[] = [
  {
    title: '暗影中的沉思者',
    label: '摄影案例 01',
    image: `${assetPath}dark-lightburst.jpeg`,
    summary: '低照度环境下控制人物情绪和硬光边界，用极暗背景把注意力集中到姿态、手部和光束。',
    planning: '先确定“压低环境、保留一道主光”的视觉设定，让人物像被舞台灯从黑暗里切出来。',
    shooting: '控制曝光不过度提亮暗部，保留高光边缘，同时让背景信息只服务于情绪。',
    editing: '后期保留暗部层次，降低杂色干扰，强化暖光与黑场之间的戏剧张力。',
  },
  {
    title: '秋日映画',
    label: '摄影案例 02',
    image: `${assetPath}autumn-triptych.jpeg`,
    summary: '把同一组人物状态拆成连续电影帧，用秋日斜射光、背景层次和动作变化组织叙事。',
    planning: '以“时间颗粒”为主题，提前规划人物站位、前景遮挡和连拍节奏。',
    shooting: '用中远景建立环境，再用人物视线和动作带出故事感，避免只拍单张好看照片。',
    editing: '色彩偏向温暖胶片感，保留柔和反差，让一组照片能作为完整小系列成立。',
  },
];

const galleryPhotos: GalleryPhoto[] = [
  {
    title: '花束与旧时光',
    category: '光影人像',
    image: `${assetPath}bouquet-profile.jpeg`,
    note: '柔焦与侧逆光处理人物情绪。',
  },
  {
    title: '骷髅与少女',
    category: '叙事场景',
    image: `${assetPath}bridal-scene.jpeg`,
    note: '道具、场景和人物共同制造故事。',
  },
  {
    title: '白伞人像',
    category: '光影人像',
    image: `${assetPath}white-umbrella-portrait.jpeg`,
    note: '古典姿态和自然背景的融合。',
  },
  {
    title: '日常光线',
    category: '日常写真',
    image: `${assetPath}daily-room-wide.jpeg`,
    note: '室内暖光塑造生活片段。',
  },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path
        d="M7 17 17 7M9 7h8v8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SectionIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="section-intro">
      <p className="section-kicker">{eyebrow}</p>
      <h2>{title}</h2>
      <div className="section-copy">{children}</div>
    </div>
  );
}

function App() {
  return (
    <div className="site-shell">
      <header className="site-header" aria-label="主导航">
        <a className="brand" href="#top" aria-label="返回首页">
          <span className="brand-mark">J</span>
          <span>贾志超｜摄影与运营</span>
        </a>
        <nav className="nav-links">
          <a href="#operation">运营能力</a>
          <a href="#cases">摄影案例</a>
          <a href="#planning">拍摄策划</a>
          <a href="#contact">联系</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="hero-meta">Personal Brand / Photography / New Media</p>
            <h1 id="hero-title">摄影审美与新媒体运营并行的个人展示。</h1>
            <p className="hero-lead">
              少量照片展示拍摄审美和策划能力，运营经历前置展示，重点说明我既能拍出内容，也能把内容组织、传播并转化。
            </p>
            <div className="hero-actions">
              <a className="primary-link" href="#operation">
                先看运营能力
                <ArrowIcon />
              </a>
              <a className="secondary-link" href="#cases">查看摄影案例</a>
            </div>
          </div>

          <div className="hero-showcase" aria-label="个人能力首屏展示">
            <img src={`${assetPath}dark-lightburst.jpeg`} alt="暗调光影摄影代表作品" />
            <div className="hero-proof-card">
              <p>新媒体运营成果</p>
              <div>
                {operationProofs.map((proof) => (
                  <span key={proof.label}>
                    <strong>{proof.value}</strong>
                    {proof.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="page-section operation-section" id="operation">
          <div className="operation-copy">
            <p className="section-kicker">New Media Operation</p>
            <h2>新媒体运营前置展示：我不只会拍，也会让内容被看见。</h2>
            <p>
              运营能力放在第二屏，作为个人品牌的核心证明之一：活动策划、社群运营、短视频/图文内容和账号增长都来自简历中的真实经历。
            </p>
          </div>
          <div className="proof-grid">
            {operationProofs.map((proof) => (
              <div className="proof-item" key={proof.label}>
                <strong>{proof.value}</strong>
                <span>{proof.label}</span>
              </div>
            ))}
          </div>
          <div className="operation-notes">
            {operationHighlights.map((highlight) => (
              <p key={highlight}>{highlight}</p>
            ))}
          </div>
        </section>

        <section className="page-section" id="cases">
          <SectionIntro eyebrow="Selected Case Studies" title="摄影案例：保留少量，但讲清楚策划思路">
            <p>
              照片不铺太多，只保留两个能代表能力的案例。重点不是数量，而是讲清楚主题、场景、光线和后期。
            </p>
          </SectionIntro>

          <div className="case-list">
            {caseStudies.map((caseStudy, index) => (
              <article className="case-panel" key={caseStudy.title}>
                <div className="case-image-wrap">
                  <img src={caseStudy.image} alt={caseStudy.title} />
                </div>
                <div className="case-content">
                  <p className="case-label">{caseStudy.label}</p>
                  <h3>{caseStudy.title}</h3>
                  <p className="case-summary">{caseStudy.summary}</p>

                  <div className="case-breakdown" aria-label={`${caseStudy.title}策划拆解`}>
                    <div>
                      <span>策划</span>
                      <p>{caseStudy.planning}</p>
                    </div>
                    <div>
                      <span>拍摄</span>
                      <p>{caseStudy.shooting}</p>
                    </div>
                    <div>
                      <span>后期</span>
                      <p>{caseStudy.editing}</p>
                    </div>
                  </div>
                </div>
                <span className="case-number">{String(index + 1).padStart(2, '0')}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="page-section gallery-section" id="gallery">
          <SectionIntro eyebrow="Photo Selection" title="照片精选：只保留几张代表图">
            <p>这里从摄影集中压缩出 4 张代表图，作为审美补充，不再做大面积照片墙。</p>
          </SectionIntro>

          <div className="gallery-grid">
            {galleryPhotos.map((photo) => (
              <article className="gallery-card" key={photo.title}>
                <img src={photo.image} alt={photo.title} />
                <div>
                  <span>{photo.category}</span>
                  <h3>{photo.title}</h3>
                  <p>{photo.note}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="page-section planning-section" id="planning">
          <SectionIntro eyebrow="Planning Method" title="拍摄策划能力：从想法到成片的四步">
            <p>
              摄影能力不只在按下快门那一刻。真正能交付稳定结果的是：先定主题，再搭场域，拍摄时控制变量，最后用后期统一表达。
            </p>
          </SectionIntro>

          <div className="planning-layout">
            <img src={`${assetPath}black-white-portrait.jpeg`} alt="黑白人像作品" />
            <ol className="planning-steps">
              <li>
                <span>01</span>
                <div>
                  <h3>主题设定</h3>
                  <p>用“暗影、秋日、节日、校园、城市”等关键词先确定情绪方向，让模特、道具和场景围绕同一个概念服务。</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>场景组织</h3>
                  <p>选择有叙事能力的环境，并提前判断前景、背景、人物比例和道具位置，减少现场拍摄的随机性。</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>光线控制</h3>
                  <p>根据暗调、逆光、暖光、多光源等不同场景，控制曝光、色温和人物轮廓，让光线成为叙事的一部分。</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <h3>后期统一</h3>
                  <p>通过 Lightroom、Photoshop 和达芬奇等工具统一色彩、颗粒、反差与肤色，让作品以系列而不是散图呈现。</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="contact-section" id="contact" aria-labelledby="contact-title">
          <div>
            <p className="section-kicker">Contact</p>
            <h2 id="contact-title">适合摄影约拍、活动影像记录和新媒体内容共创。</h2>
            <p>邮箱：2367707584@qq.com　电话：18730380081</p>
          </div>
          <div className="contact-actions">
            <a className="primary-link" href="mailto:2367707584@qq.com">
              邮件联系
              <ArrowIcon />
            </a>
            <a className="secondary-link contact-phone" href="tel:18730380081">电话联系</a>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
