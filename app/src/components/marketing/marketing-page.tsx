"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AtomsLogo } from "./atoms-logo";

const BUILDS = [
  { title: "SaaS 落地页", sub: "托管 · 登录 · 支付", emoji: "🚀" },
  { title: "独立品牌与批发", sub: "电商 · 品牌 · 批发", emoji: "🛍️" },
  { title: "电影工作室网站", sub: "作品集 · 展示", emoji: "🎬" },
  { title: "热门推荐平台", sub: "内容 · 推荐 · 增长", emoji: "🔥" },
  { title: "创意视频", sub: "创作 · 分享", emoji: "🎥" },
  { title: "射击游戏", sub: "游戏 · 娱乐", emoji: "🎮" },
];

const AGENTS = [
  { name: "Iris", role: "Deep Researcher", cls: "c-blue", desc: "通过深度研究找到真实需求与细分市场，把信号转化为聚焦的机会。" },
  { name: "Bob", role: "Architect", cls: "c-purple", desc: "设计系统蓝图，选择合适的结构，让应用可扩展且可靠。" },
  { name: "Adrian", role: "Ads Specialist", cls: "c-orange", desc: "自动管理广告投放与优化，以更少投入实现增长。" },
  { name: "Emma", role: "Product Manager", cls: "c-pink", desc: "把想法转化为明确规格与范围，保证构建简单可用。" },
  { name: "Mike", role: "Team Leader", cls: "c-green", desc: "端到端协调各智能体，并在关键节点请求你的确认。" },
  { name: "Sarah", role: "SEO Specialist", cls: "c-teal", desc: "快速产出 SEO 页面并自动优化，带来自然流量。" },
  { name: "Alex", role: "Engineer", cls: "c-blue", desc: "连接前端、后端、集成与部署，构建可上线的全栈应用。" },
  { name: "David", role: "Data Analyst", cls: "c-yellow", desc: "分析数据发现增长机会，输出清晰洞察辅助决策。" },
];

const LOGOS = ["OpenAI", "NVIDIA", "Stanford", "Google", "Amazon", "MIT", "Microsoft", "Salesforce", "Berkeley", "Tesla", "Samsung"];

const FAQS = [
  { q: "什么是 Atoms？", a: "Atoms 是一个由 AI 驱动的开发平台，可将你的想法变成可运行的产品。它运行多智能体工作流，由 AI 团队协同完成规划、构建、测试与发布。" },
  { q: "我可以用 Atoms 构建什么？", a: "如果你能描述它，Atoms AI 就能构建它。常见项目包括 SaaS 产品、内部工具、个人网站与电子商务站点。" },
  { q: "使用 Atoms 是否需要编程或技术技能？", a: "不。你可以通过自然语言来构建。只要能准确描述自己想要什么，就能够构建它。高级用户也可以直接编辑代码。" },
  { q: "Atoms 应用或网站如何部署？", a: "AI 会在服务器上为你的项目分配端口并启动服务，你可以立刻通过子路径地址访问。" },
  { q: "积分体系如何运作，定价是否透明？", a: "Atoms 使用透明的积分体系，积分按任务复杂度消耗，你可以在工作台实时查看使用情况。" },
  { q: "Atoms 如何帮助我获得付费客户？", a: "从第一天起就围绕增长构建：SEO 页面、支付能力与数据看板都可以在对话中完成。" },
  { q: "我是否拥有使用 Atoms 构建的内容？", a: "是的。项目文件完整保存在你的项目目录中，随时可以导出或同步到 GitHub。" },
  { q: "Atoms 可以与我已经使用的工具集成吗？", a: "支持。AI 可以在项目目录中执行命令、安装依赖并接入常用第三方服务。" },
  { q: "Atoms 是否支持我的母语？", a: "是的。Atoms 支持自然语言输入，你可以用母语构思、对话与构建。" },
];

function Check({ hot }: { hot?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="8" fill={hot ? "rgba(66,103,255,.35)" : "rgba(45,187,92,.15)"} />
      <path d="M4.7 8.3l2.2 2.2 4.4-4.6" stroke={hot ? "#fff" : "#2dbb5c"} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function MarketingPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [monthly, setMonthly] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [tipOpen, setTipOpen] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const description = prompt.trim();
    if (!description || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (data.project?.id) {
        router.push(`/app/${data.project.id}?q=${encodeURIComponent(description)}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="atoms-marketing" ref={rootRef}>
      <div className="top-banner">
        Atoms：用 AI 构建网站与应用，无需编码 <b>立即上手</b>
      </div>

      <header className="mk-header">
        <div className="container nav">
          <a className="nav-logo" href="#hero-form" aria-label="Atoms">
            <AtomsLogo />
          </a>
          <nav className="nav-links">
            <a href="#builds">模板</a>
            <a href="#team">资源</a>
            <a href="#stories">社区</a>
            <a href="#faq">关于</a>
            <a href="#pricing">定价</a>
          </nav>
          <div className="nav-right">
            <Link className="login" href="/dashboard">登录</Link>
            <a className="btn btn-primary" href="#hero-form">注册</a>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <div className="hero-badge">
            <span className="dot" />
            AI 员工，几分钟内从想法到上线
          </div>
          <h1>
            把想法变成可销售的
            <br />
            <span className="accent">产品</span>
          </h1>
          <p>AI 员工用于验证想法、构建产品并获取客户。几分钟内完成。无需编码。</p>
          <form className="hero-form" id="hero-form" onSubmit={handleCreate}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想构建的产品，例如：一个预约看牙的小程序…"
            />
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? "创建中…" : "开始"}
            </button>
          </form>
          <div className="hero-note">免费开始，无需信用卡</div>
        </div>
      </section>

      <section className="builds" id="builds">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">BUILD ANYTHING</span>
            <h2>Atoms 能构建什么？</h2>
            <p>从落地页到全栈应用，描述你的想法，剩下的交给 AI 团队。</p>
          </div>
          <div className="builds-grid">
            {BUILDS.map((b) => (
              <div className="build-card reveal" key={b.title}>
                <div className="thumb" aria-hidden>{b.emoji}</div>
                <div className="meta">
                  <h3>{b.title}</h3>
                  <p>{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="trust">
        <div className="container">
          <div className="sec-head reveal">
            <h2>为什么大家信任 Atoms？</h2>
            <p>全球构建者、顶级研究与开发者社区的共同选择。</p>
          </div>
          <div className="trust-grid">
            <div className="t-card t-video reveal">
              <div className="play">
                <div className="ring">
                  <div className="tri" />
                </div>
              </div>
              <div className="label">探索 Atoms</div>
              <div className="big" style={{ fontSize: 22 }}>
                看 AI 团队
                <br />
                如何协同工作
              </div>
            </div>
            <div className="t-card reveal">
              <div className="label">全球触达</div>
              <div className="big"><em>170+</em></div>
              <div className="desc">使用 Atoms 的国家和地区</div>
            </div>
            <div className="t-card reveal">
              <div className="label">正在创建课程</div>
              <div className="big" style={{ fontSize: 19 }}>我如何用 Atoms AI 打造可变现的 app</div>
              <div className="desc">查看详情 →</div>
            </div>
            <div className="t-card reveal">
              <div className="label">社区</div>
              <div className="big"><em>1M+</em></div>
              <div className="desc">我们社区中的构建者，用 Atoms 让创意落地。</div>
            </div>
            <div className="t-card reveal">
              <div className="label">学术研究 · 约 30 篇论文</div>
              <div className="papers">
                {[
                  ["MetaGPT", "ICLR 2024 口头报告"],
                  ["AFlow", "ICLR 2025 口头报告"],
                  ["Atom of Thoughts", "NeurIPS 2025"],
                  ["AOrchestra", "arXiv 2026"],
                ].map(([n, c]) => (
                  <div className="paper" key={n}>
                    {n} <span className="conf">{c}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="t-card t-github reveal">
              <div className="label">GitHub</div>
              <div className="big">★ 16.8万</div>
              <div className="desc">我们团队开源项目累计获得的 GitHub Star。</div>
            </div>
            <div className="t-card t-ph reveal">
              <div className="label">Product Hunt</div>
              <div className="big">
                #1<span>每周精选产品</span>
              </div>
              <div className="desc">上线一周即登顶 Product Hunt 周榜。</div>
            </div>
          </div>
        </div>
      </section>

      <section className="logos">
        <div className="container">
          <p>受到这些公司的创作者信赖：</p>
          <div className="logo-wall">
            {LOGOS.map((l) => (
              <div className="lg" key={l}>{l}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="team" id="team">
        <div className="container">
          <div className="sec-head reveal">
            <h2>
              你的 <span style={{ color: "var(--blue)" }}>AI 团队</span>，帮助你更快构建并赢得客户
            </h2>
          </div>
          <p className="team-sub">
            一个完整的 AI 团队，帮助你以更低成本更快发布。你做决策，智能体负责研究、规划、构建、测试和增长。
            <br />
            <a className="btn btn-dark" href="#hero-form">立即尝试</a>
          </p>
          <div className="team-grid">
            {AGENTS.map((a) => (
              <div className="agent reveal" key={a.name}>
                <div className="ava">{a.name.slice(0, 1)}</div>
                <div className="name">{a.name}</div>
                <div className={`role ${a.cls}`}>{a.role}</div>
                <div className="desc">{a.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="workflow">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">ALL-IN-ONE</span>
            <h2>
              调研、设计、编程、
              <br />
              <span style={{ background: "linear-gradient(90deg,#4267ff,#b88ade)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                增长，尽在一处
              </span>
            </h2>
            <p>调研、设计、代码与增长协同推进</p>
          </div>

          <div className="wf-row reveal">
            <div className="wf-text">
              <span className="tag">速度</span>
              <h3>几分钟即可上线，不用等几周</h3>
              <p>告诉 Atoms 你的想法，几分钟内就能看到它构建出可用的应用。通过与 AI 聊天，获取完整的功能页面、流程和特性。</p>
            </div>
            <div className="wf-visual mock-chat">
              <div className="msg user">帮我做一个宠物美容预约网站，要有会员卡和在线支付</div>
              <div className="msg ai">好的，我先完成市场调研，然后规划页面结构，随后开始构建预约流程与支付集成。</div>
              <div className="msg ai">
                <span className="typing"><i /><i /><i /></span>
              </div>
            </div>
          </div>

          <div className="wf-row reveal">
            <div className="wf-text">
              <span className="tag">真实产品</span>
              <h3>真实应用，不只是演示</h3>
              <p>构建一个可发布、可增长并可扩展的真实产品。所有刚需功能内置，包括用户登录、数据存储和支付。</p>
            </div>
            <div className="wf-visual mock-app">
              <div className="bar"><i /><i /><i /><div className="url">https://pawcare.atoms.app</div></div>
              <div className="body">
                <div className="side"><i /><i /><i /><i /><i /></div>
                <div className="main">
                  <div className="row">
                    <div className="block" style={{ width: "52%", height: 16 }} />
                    <div className="block" style={{ width: "18%", height: 16, marginLeft: "auto" }} />
                  </div>
                  <div className="hero-b" />
                  <div className="row">
                    <div className="block" style={{ flex: 1, height: 56 }} />
                    <div className="block" style={{ flex: 1, height: 56 }} />
                    <div className="block" style={{ flex: 1, height: 56 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="wf-row reveal">
            <div className="wf-text">
              <span className="tag">一站式</span>
              <h3>商业工具包，尽在一处</h3>
              <p>在一个地方运行整个工作流程。进行市场调研、构建全栈应用、部署、优化 SEO、添加集成并跟踪结果。</p>
            </div>
            <div className="wf-visual mock-dash">
              <div className="top"><div className="t">Growth Overview</div><div className="pill">Live</div></div>
              <div className="stats">
                <div className="stat"><div className="k">访问量</div><div className="v">12,480</div></div>
                <div className="stat"><div className="k">注册</div><div className="v">1,024</div></div>
                <div className="stat"><div className="k">本周收入</div><div className="v">$3,268</div><div className="v g">↑ 18.2%</div></div>
              </div>
              <div className="chart">
                <svg viewBox="0 0 400 110" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#4267ff" stopOpacity=".5" />
                      <stop offset="1" stopColor="#4267ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 95 C40 90 60 70 100 72 S160 55 200 48 260 40 300 26 360 18 400 10 L400 110 L0 110 Z" fill="url(#lg1)" />
                  <path d="M0 95 C40 90 60 70 100 72 S160 55 200 48 260 40 300 26 360 18 400 10" fill="none" stroke="#4267ff" strokeWidth="2.5" />
                </svg>
              </div>
            </div>
          </div>

          <div className="wf-row reveal">
            <div className="wf-text">
              <span className="tag">变现</span>
              <h3>获得付费客户和收入</h3>
              <p>把想法变成用户愿意付费的产品。Atoms 负责发布、托管和日常运营，让你更快实现收入。</p>
            </div>
            <div className="wf-visual mock-rev">
              <div className="amount">$12,940<small>↑ 24%</small></div>
              <div className="bars">
                {[26, 38, 32, 52, 46, 64, 58, 82, 100].map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="cap">月度经常性收入（MRR）</div>
            </div>
          </div>

          <div className="wf-row reveal">
            <div className="wf-text">
              <span className="tag">所有权</span>
              <h3>始终拥有完整所有权</h3>
              <p>随时导出代码并同步到 GitHub。在你的业务增长时，保持对项目的完全控制。</p>
            </div>
            <div className="wf-visual mock-code">
              <div className="ln"><span className="n">1</span><span className="cm">{"// 你的项目，你的代码"}</span></div>
              <div className="ln"><span className="n">2</span><span><span className="kw">import</span> {"{ deploy }"} <span className="kw">from</span> <span className="s">&apos;@atoms/sdk&apos;</span>;</span></div>
              <div className="ln"><span className="n">3</span><span>&nbsp;</span></div>
              <div className="ln"><span className="n">4</span><span><span className="kw">await</span> <span className="fn">deploy</span>({"{"}</span></div>
              <div className="ln"><span className="n">5</span><span>&nbsp;&nbsp;project: <span className="s">&apos;pawcare-app&apos;</span>,</span></div>
              <div className="ln"><span className="n">6</span><span>&nbsp;&nbsp;sync: <span className="s">&apos;github&apos;</span> <span className="cm">{"// 一键同步到 GitHub"}</span></span></div>
              <div className="ln"><span className="n">7</span><span>{"});"}</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="video-sec">
        <div className="container">
          <div className="video-wrap reveal">
            <div className="vplay">
              <div className="ring"><div className="tri" /></div>
              <span>几分钟而不是几周</span>
            </div>
          </div>
          <div className="video-cap reveal">
            <h3>免费试用</h3>
            <p>几分钟而不是几周</p>
            <a className="btn btn-dark" href="#hero-form">免费开始构建</a>
          </div>
        </div>
      </section>

      <section className="everything">
        <div className="container">
          <div className="sec-head reveal">
            <h2>你所需的一切</h2>
            <p>构建、发布与变现 —— 收入集中展示</p>
          </div>
          <div className="bento">
            <div className="b-card b-rev reveal">
              <h3>收入集中展示</h3>
              <p>构建、发布和增长所需的一切。收入、订阅与客户数据集中在一处仪表盘。</p>
              <div className="mini-bars">
                {[30, 45, 38, 62, 55, 78, 100, 86].map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="b-card b-more reveal">
              <h3>更多功能</h3>
              <p>持续扩展的能力集：</p>
              <div className="chips">
                {["深度研究", "主题设计", "Atoms Backend", "SEO 专家"].map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
            {[
              { ico: "✎", cls: "ico-blue", t: "可视化编辑器", d: "精准实现你的设计。一个可视化编辑器，可快速调整布局和组件。" },
              { ico: "☁", cls: "ico-teal", t: "Atoms 云", d: "为你的应用提供全栈后端，包括用户登录、数据库、集成和可扩展的托管。" },
              { ico: "⚡", cls: "ico-green", t: "竞赛模式", d: "在多个模型上运行你的 prompt，即刻获得最佳版本。" },
              { ico: "✦", cls: "ico-purple", t: "即时 AI 集成", d: "使用 Gemini 和 GPT 等模型为你的产品添加强大的 AI，无需额外设置。" },
              { ico: "◎", cls: "ico-orange", t: "SEO 智能体", d: "自动使你的网站搜索引擎可见，让 Google 能爬取与索引。" },
              { ico: "↗", cls: "ico-pink", t: "广告专家", d: "以更少的人工工作实现增长扩展，自动管理广告系列。" },
            ].map((c) => (
              <div className="b-card b-2col reveal" key={c.t}>
                <h3><span className={`ico ${c.cls}`}>{c.ico}</span>{c.t}</h3>
                <p>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="stories" id="stories">
        <div className="container">
          <div className="sec-head reveal">
            <h2>遍及 <span style={{ color: "var(--blue)" }}>世界</span> 的成功故事</h2>
          </div>
          <div className="stories-grid">
            <div className="story-cta reveal">
              <div>
                <h3>下一个成功故事，<br />由你书写</h3>
                <p>加入 1M+ 构建者，用 Atoms 把你的想法变成真实的产品。</p>
              </div>
              <a className="btn" href="#hero-form">开启你的成功故事</a>
            </div>
            <div className="story-card reveal">
              <div className="quote">
                我经营一家窗户清洁业务，过去依赖多个应用来完成工作。我构建了一个将预约估价、日程安排和客户文件集中在一个地方的应用。”
              </div>
              <div className="who">
                <div className="ava" />
                <div>
                  <div className="nm">Sal</div>
                  <div className="lo">United States</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="container">
          <div className="sec-head reveal">
            <h2>定价</h2>
            <p>免费开始。灵活扩展。</p>
          </div>
          <div className="bill-toggle">
            <span className={`opt ${!monthly ? "on" : ""}`}>按年</span>
            <div className={`switch ${monthly ? "m" : ""}`} onClick={() => setMonthly((v) => !v)} role="button" tabIndex={0}>
              <i />
            </div>
            <span className={`opt ${monthly ? "on" : ""}`}>按月</span>
            <span className="save">· 最多可节省 21%</span>
          </div>
          <div className="price-grid">
            <div className="price-card reveal">
              <div className="p-name">免费版</div>
              <div className="amt">$0<small> /月</small></div>
              <div className="p-desc">永久免费，适合轻度使用</div>
              <div className="p-list">
                <div className="li"><Check />每天 15 / 每月 25 积分</div>
                <div className="li"><Check />基础模型访问</div>
                <div className="li"><Check />社区支持</div>
              </div>
              <a className="btn btn-ghost" href="#hero-form">免费开始</a>
            </div>
            <div className="price-card hot reveal">
              <div className="badge">最受欢迎</div>
              <div className="p-name">专业版</div>
              <div className="amt"><span>{monthly ? "$20" : "$16"}</span><small> /月起</small></div>
              <div className="p-desc">专为高频使用的专业人士设计</div>
              <div className="p-list">
                <div className="li"><Check hot />100 积分/月（默认），可扩展至 250 或 350 积分</div>
                <div className="li"><Check hot />高级模型与竞赛模式</div>
                <div className="li"><Check hot />代码导出与 GitHub 同步</div>
                <div className="li"><Check hot />优先支持</div>
              </div>
              <a className="btn" href="#hero-form">选择专业版</a>
            </div>
            <div className="price-card reveal">
              <div className="p-name">Max</div>
              <div className="amt"><span>{monthly ? "$100" : "$80"}</span><small> /月起</small></div>
              <div className="p-desc">更高的准确率、算力和存储。增强模式可将准确率提升至 3×</div>
              <div className="p-list">
                <div className="li"><Check />500 积分/月（默认），最高可选 10,000 积分</div>
                <div className="li"><Check />增强模式：准确率提升至 3×</div>
                <div className="li"><Check />更大存储与并发</div>
                <div className="li"><Check />专属支持</div>
              </div>
              <a className="btn btn-ghost" href="#hero-form">选择 Max</a>
            </div>
          </div>
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="container">
          <div className="sec-head reveal">
            <h2>常见问题</h2>
          </div>
          <div className="faq-list reveal">
            {FAQS.map((f, i) => (
              <div className={`faq-item ${openFaq === i ? "open" : ""}`} key={f.q}>
                <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {f.q}
                  <span className="pm">＋</span>
                </button>
                <div className="faq-a">
                  <div className="inner">{f.a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>把想法变成畅销的<span>产品</span></h2>
          <a className="btn" href="#hero-form">免费开始构建</a>
        </div>
      </section>

      <footer className="mk-footer">
        <div className="container">
          <div className="foot-grid">
            <div className="foot-brand">
              <AtomsLogo />
              <p>把想法变成可销售的产品</p>
            </div>
            <div className="foot-cols">
              <div className="foot-col">
                <h4>产品</h4>
                <a href="#">AI Agents</a>
                <a href="#">模型</a>
                <a href="#">工具</a>
                <a href="#">帮助中心</a>
              </div>
              <div className="foot-col">
                <h4>发现</h4>
                <a href="#">用例</a>
                <a href="#">比较</a>
                <a href="#">博客</a>
                <a href="#">GitHub</a>
              </div>
              <div className="foot-col">
                <h4>公司</h4>
                <a href="#">关于我们</a>
                <a href="#">MetaGPT</a>
                <a href="#">OpenManus</a>
                <a href="#">隐私政策</a>
              </div>
            </div>
            <div className="foot-col">
              <h4>关注我们</h4>
              <div className="foot-social">
                <a href="#" aria-label="X">𝕏</a>
                <a href="#" aria-label="LinkedIn">in</a>
                <a href="#" aria-label="Discord">D</a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Atoms. 把想法变成可销售的产品</span>
            <span>中文</span>
          </div>
        </div>
      </footer>

      {tipOpen && (
        <div className="float-tip">
          <button className="close" onClick={() => setTipOpen(false)} aria-label="关闭">✕</button>
          <div className="em">✦</div>
          <div>
            <b>准备好构建了吗？</b>描述你的想法，AI 团队立即开工。
          </div>
        </div>
      )}
    </div>
  );
}
