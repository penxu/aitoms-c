/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { AtomsLogo } from "./atoms-logo";

const CDN = "https://public-frontend-cos.metadl.com/commonfile";

const BUILDS = [
  {
    img: `${CDN}/home/v1.3.x/founder-builds/saas-landing/poster.webp`,
    alt: "SaaS 落地页",
    title: "SaaS 落地页",
    sub: "托管 · 登录 · 支付",
    prompt: "做一个 SaaS 产品落地页，包含首屏、功能、定价和注册入口",
  },
  {
    img: `${CDN}/home/v1.3.x/founder-builds/independent-brands/poster.webp`,
    alt: "独立品牌与批发",
    title: "独立品牌与批发",
    sub: "电商 · 品牌 · 批发",
    prompt: "做一个独立咖啡品牌官网，包含品牌介绍、产品展示和批发询价表单",
  },
  {
    img: `${CDN}/home/v1.3.x/founder-builds/film-studio/poster.webp`,
    alt: "电影工作室网站",
    title: "电影工作室网站",
    sub: "作品集 · 展示",
    prompt: "做一个电影工作室网站，展示作品片单、预告片和团队介绍",
  },
  {
    img: `${CDN}/home/v1.3.x/founder-builds/popular/poster.webp`,
    alt: "热门推荐平台",
    title: "热门推荐平台",
    sub: "内容 · 推荐 · 增长",
    prompt: "做一个内容推荐平台，支持分类浏览、收藏和热门榜单",
  },
  {
    img: `${CDN}/home/v1.3.x/founder-builds/creative-video/poster.webp`,
    alt: "创意视频",
    title: "创意视频",
    sub: "创作 · 分享",
    prompt: "做一个创意视频展示与分享网站，包含作品列表和播放页",
  },
  {
    img: `${CDN}/home/v1.3.x/founder-builds/shooting-game/poster.webp`,
    alt: "射击游戏",
    title: "射击游戏",
    sub: "游戏 · 娱乐",
    prompt: "做一个太空射击小游戏，有分数、生命值和排行榜",
  },
];

const PAPERS = [
  { img: `${CDN}/home/v1.3.x/research/ICLR.svg`, name: "MetaGPT", conf: "ICLR 2024 口头报告" },
  { img: `${CDN}/home/v1.3.x/research/ICLR.svg`, name: "AFlow", conf: "ICLR 2025 口头报告" },
  { img: `${CDN}/home/v1.3.x/research/arXiv.svg`, name: "基础智能体的进展与挑战", conf: "arXiv 2025" },
  { img: `${CDN}/home/v1.3.x/research/NeurIPS.svg`, name: "Atom of Thoughts", conf: "NeurIPS 2025" },
  { img: `${CDN}/home/v1.3.x/research/ICML.svg`, name: "AutoWebWorld", conf: "ICML 2026" },
  { img: `${CDN}/home/v1.3.x/research/arXiv.svg`, name: "AOrchestra", conf: "arXiv 2026" },
];

const LOGOS = [
  { file: "openai", name: "OpenAI" },
  { file: "nvidia", name: "NVIDIA" },
  { file: "stanford", name: "Stanford" },
  { file: "google", name: "Google" },
  { file: "amazon", name: "Amazon" },
  { file: "mit", name: "MIT" },
  { file: "microsoft", name: "Microsoft" },
  { file: "salesforce", name: "Salesforce" },
  { file: "uc-berkeley", name: "UC Berkeley" },
  { file: "tesla", name: "Tesla" },
  { file: "samsung", name: "Samsung" },
];

const AGENTS = [
  { name: "Iris", role: "Deep Researcher", color: "c-blue", avatar: 1, desc: "通过 Deep Research 发现真实需求和细分市场，然后将信号转化为聚焦的机会。" },
  { name: "Bob", role: "Architect", color: "c-purple", avatar: 2, desc: "设计系统蓝图，选择合适的结构，使你的应用可扩展且可靠。" },
  { name: "Adrian", role: "Ads Specialist", color: "c-orange", avatar: 3, desc: "自动运行 Google Ads。负责管理广告系列创建、跟踪和优化，以更少的投入实现增长扩展。" },
  { name: "Emma", role: "Product Manager", color: "c-pink", avatar: 4, desc: "将你的想法转化为明确的规格和范围，以便构建保持简单且可用。" },
  { name: "Mike", role: "Team Leader", color: "c-green", avatar: 5, desc: "端到端运行计划，协调 agents，并请求你的批准，这样你在保持知情的同时也能快速行动。" },
  { name: "Sarah", role: "SEO Specialist", color: "c-teal", avatar: 1, desc: "快速推出 SEO 页面并自动化优化，以更低的成本快速带来自然流量。" },
  { name: "Alex", role: "Engineer", color: "c-blue", avatar: 2, desc: "通过连接前端、后端、集成和部署，构建一个可投入生产的全栈应用。" },
  { name: "David", role: "Data Analyst", color: "c-yellow", avatar: 3, desc: "通过分析海量数据发现增长机会，并呈现清晰洞察，帮助你做出更明智、数据驱动的决策。" },
];

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "什么是 Atoms？",
    a: "Atoms 是一个由 AI 驱动的开发平台，可将你的想法变成可运行的产品。它运行多智能体工作流，由一支 AI 团队组成，例如产品经理、工程师和数据科学家，他们协同工作，从零开始规划、构建、测试并发布你的应用。",
  },
  {
    q: "我可以用 Atoms 构建什么？",
    a: (
      <>
        如果你能描述它，Atoms AI 就能构建它。常见项目包括：
        <ul>
          <li><b>SaaS</b>：基于订阅的产品，具有用户登录和实时数据库存储</li>
          <li><b>内部工具</b>：用于管理业务数据的仪表板和工具</li>
          <li><b>个人网站</b>：精美的作品集、博客或个人品牌网站</li>
          <li><b>电子商务</b>：具有转化能力的产品页面，并通过 Stripe 提供安全支付</li>
        </ul>
      </>
    ),
  },
  {
    q: "使用 Atoms 是否需要编程或技术技能？",
    a: "不。Atoms AI 是 vibe coding 工具，这意味着你可以通过自然语言来构建。只要能准确描述自己想要什么，就能够构建它。对于高级用户，Atoms AI 还包含代码编辑器，但入门不需要编程经验。",
  },
  {
    q: "Atoms 应用或网站如何部署？",
    a: "一键即可。Atoms AI 为你处理托管和服务器配置。准备好后即可立即发布在线 URL。无需复杂设置。",
  },
  {
    q: "积分体系如何运作，定价是否透明？",
    a: "Atoms 使用透明的积分体系。积分根据 AI 执行任务的复杂度消耗，例如生成功能、测试和部署。你可以在仪表板上实时查看积分余额和使用情况，从而管理预算。",
  },
  {
    q: "Atoms 如何帮助我获得付费客户？",
    a: "Atoms AI 帮助你超越一个完成的应用，从第一天起推动增长。你可以发布 SEO 页面并自动化 SEO 改进。内置 Stripe 支付，发布后即可开始收费。",
  },
  {
    q: "我是否拥有使用 Atoms 构建的内容？",
    a: "是的。你可以随时导出代码或将项目同步到 GitHub，这样在持续开发和扩充时就始终拥有完全的控制权。导出代码后，你可以在本地运行它或将其托管在自己的基础设施上。这有助于在产品增长时保持灵活性。",
  },
  {
    q: "Atoms 可以与我已经使用的工具集成吗？",
    a: "是的。Atoms AI 支持与常用工具集成，因此你可以接入现有的工作流程。这有助于你构建可用于真实业务的可行方案，而不仅仅是一个演示。",
  },
  {
    q: "Atoms 是否支持我的母语？",
    a: "是的。Atoms 支持自然语言输入，并能跨多种语言工作。你可以使用母语进行构思、聊天和构建，从而获得无缝的开发体验。",
  },
];

function PriceCheck({ hot = false }: { hot?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill={hot ? "rgba(66,103,255,.35)" : "rgba(45,187,92,.15)"} />
      <path
        d="M4.7 8.3l2.2 2.2 4.4-4.6"
        stroke={hot ? "#fff" : "#2dbb5c"}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MarketingPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [monthly, setMonthly] = useState(false);
  const [tipOpen, setTipOpen] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // 减少动效偏好或浏览器不支持 IntersectionObserver 时直接全部显示，
    // 不依赖滚动观察，避免内容停留在初始的 opacity: 0。
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      root.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12 },
    );
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    const description = prompt.trim();
    if (!description) {
      setError("写下一句话，让我们从你的想法开始。");
      inputRef.current?.focus();
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok || !data.project?.id) throw new Error(data.error ?? "创建失败，请重试。");
      router.push(`/app/${data.project.id}?q=${encodeURIComponent(description)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败，请保留想法后重试。");
    } finally {
      setCreating(false);
    }
  }

  function fillTemplate(text: string) {
    setPrompt(text);
    setError("");
    document.getElementById("hero-form")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "center",
    });
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="atoms-landing" ref={rootRef}>
      <div className="top-banner">
        Atoms：用 AI 构建网站与应用，无需编码{" "}
        <a href="#hero-form">
          <b>立即上手</b>
        </a>
      </div>

      <header>
        <div className="container nav">
          <Link className="nav-logo" href="/" aria-label="Atoms 首页">
            <AtomsLogo />
          </Link>
          <nav className="nav-links" aria-label="首页导航">
            <a href="#builds">模板</a>
            <a href="#everything">资源</a>
            <a href="#stories">社区</a>
            <a href="#team">关于</a>
            <a href="#pricing">定价</a>
          </nav>
          <div className="nav-right">
            <Link className="login" href="/dashboard">
              我的项目
            </Link>
            <a className="btn btn-primary" href="#hero-form">
              开始构建
            </a>
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
              ref={inputRef}
              type="text"
              aria-label="描述你想构建的产品"
              aria-describedby={error ? "create-error" : undefined}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (error) setError("");
              }}
              placeholder="描述你想构建的产品，例如：一个预约看牙的小程序…"
            />
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating && <LoaderCircle size={16} className="animate-spin" />}
              {creating ? "创建中" : "开始"}
            </button>
          </form>
          {error && (
            <div id="create-error" role="alert" className="hero-error">
              {error}
            </div>
          )}
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
            {BUILDS.map((item) => (
              <button
                type="button"
                className="build-card reveal"
                key={item.title}
                onClick={() => fillTemplate(item.prompt)}
              >
                <div className="thumb">
                  <img src={item.img} alt={item.alt} loading="lazy" />
                </div>
                <div className="meta">
                  <h3>{item.title}</h3>
                  <p>{item.sub}</p>
                </div>
              </button>
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
              <div className="big" style={{ fontSize: 22, fontWeight: 600 }}>
                看 AI 团队
                <br />
                如何协同工作
              </div>
            </div>
            <div className="t-card reveal">
              <div className="label">全球触达</div>
              <div className="big">
                <em>170+</em>
              </div>
              <div className="desc">使用 Atoms 的国家和地区</div>
            </div>
            <div className="t-card reveal">
              <div className="label">正在创建课程</div>
              <div className="big" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.4 }}>
                我如何用 Atoms AI 打造可变现的 app
              </div>
              <a className="course-link" href="#hero-form">
                查看详情 →
              </a>
            </div>
            <div className="t-card reveal">
              <div className="label">社区</div>
              <div className="big">
                <em>1M+</em>
              </div>
              <div className="desc">我们社区中的构建者，用 Atoms 让创意落地。</div>
            </div>
            <div className="t-card reveal">
              <div className="label">学术研究 · 约 30 篇论文</div>
              <div className="papers">
                {PAPERS.map((paper) => (
                  <div className="paper" key={paper.name}>
                    <img src={paper.img} alt="" loading="lazy" />
                    {paper.name}
                    <span className="conf">{paper.conf}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="t-card t-github reveal">
              <div className="label">GitHub</div>
              <div className="big">
                <svg viewBox="0 0 1024 1024" aria-hidden="true">
                  <path d="M512 85.376A426.56 426.56 0 0 0 85.44 512a426.368 426.368 0 0 0 291.712 404.8c21.376 3.776 29.376-9.024 29.376-20.224 0-10.176-0.576-43.776-0.576-79.488-107.2 19.712-134.912-26.112-143.424-50.112-4.8-12.288-25.6-50.176-43.776-60.288-14.912-8-36.224-27.712-0.512-28.288 33.6-0.512 57.6 30.976 65.6 43.776 38.4 64.512 99.712 46.4 124.288 35.2 3.712-27.776 14.912-46.4 27.2-57.088-94.976-10.688-194.176-47.488-194.176-210.688 0-46.4 16.576-84.8 43.776-114.624-4.288-10.688-19.2-54.4 4.224-113.088 0 0 35.776-11.2 117.376 43.712 34.112-9.6 70.4-14.4 106.624-14.4 36.288 0 72.576 4.8 106.688 14.4 81.6-55.424 117.312-43.712 117.312-43.712 23.488 58.688 8.576 102.4 4.288 113.088a165.12 165.12 0 0 1 43.712 114.624c0 163.776-99.712 200-194.624 210.688 15.424 13.312 28.8 38.912 28.8 78.912 0 57.088-0.576 102.976-0.576 117.376 0 11.2 8 24.512 29.376 20.224A427.328 427.328 0 0 0 938.688 512a426.56 426.56 0 0 0-426.624-426.624z" />
                </svg>
                16.8万
              </div>
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
            {LOGOS.map((logo) => (
              <div className="lg" key={logo.file}>
                <img src={`${CDN}/logo_wall/light/${logo.file}.svg`} alt={logo.name} loading="lazy" />
              </div>
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
            <a className="btn btn-dark" href="#hero-form">
              立即尝试
            </a>
          </p>
          <div className="team-grid">
            {AGENTS.map((agent) => (
              <div className="agent reveal" key={agent.name}>
                <div className="ava">
                  <img
                    src={`${CDN}/home/v1.3.x/community/avatars/avatar-${agent.avatar}.webp`}
                    alt={agent.name}
                    loading="lazy"
                  />
                </div>
                <div className="name">{agent.name}</div>
                <div className={`role ${agent.color}`}>{agent.role}</div>
                <div className="desc">{agent.desc}</div>
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
              <span className="grad-text">增长，尽在一处</span>
            </h2>
            <p>调研、设计、代码与增长协同推进</p>
          </div>

          <div className="wf-row reveal">
            <div className="wf-text">
              <span className="tag">速度</span>
              <h3>几分钟即可上线，不用等几周</h3>
              <p>
                告诉 Atoms 你的想法，几分钟内就能看到它构建出可用的应用。通过与 AI 聊天，获取完整的功能页面、流程和特性。
              </p>
            </div>
            <div className="wf-visual mock-chat">
              <div className="msg user">帮我做一个宠物美容预约网站，要有会员卡和在线支付</div>
              <div className="msg ai">
                好的，我先完成市场调研，然后规划页面结构，随后开始构建预约流程与支付集成。
              </div>
              <div className="msg ai">
                <span className="typing">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          </div>

          <div className="wf-row reveal">
            <div className="wf-text">
              <span className="tag">真实产品</span>
              <h3>真实应用，不只是演示</h3>
              <p>
                构建一个可发布、可增长并可扩展的真实产品。所有刚需功能内置，包括用户登录、数据存储和 Stripe 支付。
              </p>
            </div>
            <div className="wf-visual mock-app">
              <div className="bar">
                <i />
                <i />
                <i />
                <div className="url">https://pawcare.atoms.app</div>
              </div>
              <div className="body">
                <div className="side">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
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
              <p>
                在一个地方运行整个工作流程。进行市场调研、构建全栈应用、部署、优化 SEO、添加集成并跟踪结果。Atoms
                可自动处理繁琐工作，让你专注于最重要的事情。
              </p>
            </div>
            <div className="wf-visual mock-dash">
              <div className="top">
                <div className="t">Growth Overview</div>
                <div className="pill">Live</div>
              </div>
              <div className="stats">
                <div className="stat">
                  <div className="k">访问量</div>
                  <div className="v">12,480</div>
                </div>
                <div className="stat">
                  <div className="k">注册</div>
                  <div className="v">1,024</div>
                </div>
                <div className="stat">
                  <div className="k">本周收入</div>
                  <div className="v">$3,268</div>
                  <div className="v g">↑ 18.2%</div>
                </div>
              </div>
              <div className="chart">
                <svg viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="landingLg1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#4267ff" stopOpacity=".5" />
                      <stop offset="1" stopColor="#4267ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 95 C40 90 60 70 100 72 S160 55 200 48 260 40 300 26 360 18 400 10 L400 110 L0 110 Z"
                    fill="url(#landingLg1)"
                  />
                  <path
                    d="M0 95 C40 90 60 70 100 72 S160 55 200 48 260 40 300 26 360 18 400 10"
                    fill="none"
                    stroke="#4267ff"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="wf-row reveal">
            <div className="wf-text">
              <span className="tag">变现</span>
              <h3>获得付费客户和收入</h3>
              <p>
                把想法变成用户愿意付费的产品。借助全栈业务能力，Atoms
                负责发布、托管和日常运营，让你更快实现收入。
              </p>
            </div>
            <div className="wf-visual mock-rev">
              <div className="amount">
                $12,940<small>↑ 24%</small>
              </div>
              <div className="bars">
                <i style={{ height: "26%" }} />
                <i style={{ height: "38%" }} />
                <i style={{ height: "32%" }} />
                <i style={{ height: "52%" }} />
                <i style={{ height: "46%" }} />
                <i style={{ height: "64%" }} />
                <i style={{ height: "58%" }} />
                <i style={{ height: "82%" }} />
                <i style={{ height: "100%" }} />
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
              <div className="ln">
                <span className="n">1</span>
                <span className="cm">{"// 你的项目，你的代码"}</span>
              </div>
              <div className="ln">
                <span className="n">2</span>
                <span>
                  <span className="kw">import</span> {"{ deploy }"} <span className="kw">from</span>{" "}
                  <span className="s">&apos;@atoms/sdk&apos;</span>;
                </span>
              </div>
              <div className="ln">
                <span className="n">3</span>
                <span>&nbsp;</span>
              </div>
              <div className="ln">
                <span className="n">4</span>
                <span>
                  <span className="kw">await</span> <span className="fn">deploy</span>
                  {"({"}
                </span>
              </div>
              <div className="ln">
                <span className="n">5</span>
                <span>
                  {"\u00A0\u00A0"}project: <span className="s">&apos;pawcare-app&apos;</span>,
                </span>
              </div>
              <div className="ln">
                <span className="n">6</span>
                <span>
                  {"\u00A0\u00A0"}sync: <span className="s">&apos;github&apos;</span>{" "}
                  <span className="cm">{"// 一键同步到 GitHub"}</span>
                </span>
              </div>
              <div className="ln">
                <span className="n">7</span>
                <span>{"});"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="video-sec">
        <div className="container">
          <div className="video-wrap reveal">
            <img src={`${CDN}/home/v1.3.x/founder-builds/saas-landing/poster.webp`} alt="免费试用视频" />
            <div className="vplay">
              <div className="ring">
                <div className="tri" />
              </div>
              <span>几分钟而不是几周</span>
            </div>
          </div>
          <div className="video-cap reveal">
            <h3>免费试用</h3>
            <p>几分钟而不是几周</p>
            <a className="btn btn-dark" href="#hero-form">
              免费开始构建
            </a>
          </div>
        </div>
      </section>

      <section className="everything" id="everything">
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
                <i style={{ height: "30%" }} />
                <i style={{ height: "45%" }} />
                <i style={{ height: "38%" }} />
                <i style={{ height: "62%" }} />
                <i style={{ height: "55%" }} />
                <i style={{ height: "78%" }} />
                <i style={{ height: "100%" }} />
                <i style={{ height: "86%" }} />
              </div>
            </div>
            <div className="b-card b-more reveal">
              <h3>更多功能</h3>
              <p>持续扩展的能力集：</p>
              <div className="chips">
                <span>深度研究</span>
                <span>主题设计</span>
                <span>Atoms Backend</span>
                <span>SEO 专家</span>
              </div>
            </div>
            <div className="b-card b-2col reveal">
              <h3>
                <span className="ico ico-blue">✎</span>可视化编辑器
              </h3>
              <p>精准实现你的设计。一个可视化编辑器，可快速调整布局和组件。</p>
            </div>
            <div className="b-card b-2col reveal">
              <h3>
                <span className="ico ico-teal">☁</span>Atoms 云
              </h3>
              <p>Atoms Cloud 为你的应用提供全栈后端，包括用户登录、数据库、集成和可扩展的托管。</p>
            </div>
            <div className="b-card b-2col reveal">
              <h3>
                <span className="ico ico-green">⚡</span>竞赛模式
              </h3>
              <p>在多个模型上运行你的 prompt，即刻获得最佳版本。</p>
            </div>
            <div className="b-card b-2col reveal">
              <h3>
                <span className="ico ico-purple">✦</span>即时 AI 集成
              </h3>
              <p>使用 Gemini 和 GPT 等模型为你的产品添加强大的 AI — 无需 API 密钥，无需设置。</p>
            </div>
            <div className="b-card b-2col reveal">
              <h3>
                <span className="ico ico-orange">◎</span>SEO 智能体
              </h3>
              <p>自动使你的网站搜索引擎可见，让 Google 能爬取、索引并对带来真实客户的页面进行排名。</p>
            </div>
            <div className="b-card b-2col reveal">
              <h3>
                <span className="ico ico-pink">↗</span>广告专家
              </h3>
              <p>以更少的人工工作实现增长扩展。Ads specialist 负责管理广告系列创建、跟踪和优化。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="stories" id="stories">
        <div className="container">
          <div className="sec-head reveal">
            <h2>
              遍及 <span style={{ color: "var(--blue)" }}>世界</span> 的成功故事
            </h2>
          </div>
          <div className="stories-grid">
            <div className="story-cta reveal">
              <div>
                <h3>
                  下一个成功故事，
                  <br />
                  由你书写
                </h3>
                <p>加入 1M+ 构建者，用 Atoms 把你的想法变成真实的产品。</p>
              </div>
              <a className="btn" href="#hero-form">
                开启你的成功故事
              </a>
            </div>
            <div className="story-card reveal">
              <div className="quote">
                我经营一家窗户清洁业务，过去依赖多个应用来完成工作。我构建了一个将预约估价、日程安排和客户文件集中在一个地方的应用。”
              </div>
              <div className="who">
                <div className="ava">
                  <img
                    src={`${CDN}/home/v1.3.x/community/avatars/avatar-5.webp`}
                    alt="Sal"
                    loading="lazy"
                  />
                </div>
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
            <button type="button" className={`opt ${monthly ? "" : "on"}`} onClick={() => setMonthly(false)}>
              按年
            </button>
            <button
              type="button"
              className={`switch ${monthly ? "m" : ""}`}
              aria-label="切换计费周期"
              aria-pressed={monthly}
              onClick={() => setMonthly((value) => !value)}
            >
              <i />
            </button>
            <button type="button" className={`opt ${monthly ? "on" : ""}`} onClick={() => setMonthly(true)}>
              按月
            </button>
            <span className="save">· 最多可节省 21%</span>
          </div>
          <div className="price-grid">
            <div className="price-card reveal">
              <div className="p-name">免费版</div>
              <div className="amt">
                $0<small> /月</small>
              </div>
              <div className="p-desc">永久免费，适合轻度使用</div>
              <div className="p-list">
                <div className="li">
                  <PriceCheck />
                  每天 15 / 每月 25 积分
                </div>
                <div className="li">
                  <PriceCheck />
                  基础模型访问
                </div>
                <div className="li">
                  <PriceCheck />
                  社区支持
                </div>
              </div>
              <Link className="btn btn-ghost" href="/dashboard">
                免费开始
              </Link>
            </div>
            <div className="price-card hot reveal">
              <div className="badge">最受欢迎</div>
              <div className="p-name">专业版</div>
              <div className="amt">
                <span>{monthly ? "$20" : "$16"}</span>
                <small> /月起</small>
              </div>
              <div className="p-desc">专为高频使用的专业人士设计</div>
              <div className="p-list">
                <div className="li">
                  <PriceCheck hot />
                  100 积分/月（默认），可扩展至 250 或 350 积分
                </div>
                <div className="li">
                  <PriceCheck hot />
                  高级模型与竞赛模式
                </div>
                <div className="li">
                  <PriceCheck hot />
                  代码导出与 GitHub 同步
                </div>
                <div className="li">
                  <PriceCheck hot />
                  优先支持
                </div>
              </div>
              <Link className="btn" href="/dashboard">
                选择专业版
              </Link>
            </div>
            <div className="price-card reveal">
              <div className="p-name">Max</div>
              <div className="amt">
                <span>{monthly ? "$100" : "$80"}</span>
                <small> /月起</small>
              </div>
              <div className="p-desc">更高的准确率、算力和存储。增强模式可将准确率提升至 3×</div>
              <div className="p-list">
                <div className="li">
                  <PriceCheck />
                  500 积分/月（默认），最高可选 10,000 积分
                </div>
                <div className="li">
                  <PriceCheck />
                  增强模式：准确率提升至 3×
                </div>
                <div className="li">
                  <PriceCheck />
                  更大存储与并发
                </div>
                <div className="li">
                  <PriceCheck />
                  专属支持
                </div>
              </div>
              <Link className="btn btn-ghost" href="/dashboard">
                选择 Max
              </Link>
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
            {FAQS.map((faq, index) => (
              <div className={`faq-item ${openFaq === index ? "open" : ""}`} key={faq.q}>
                <button
                  type="button"
                  className="faq-q"
                  aria-expanded={openFaq === index}
                  aria-controls={`faq-panel-${index}`}
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  {faq.q}
                  <span className="pm">＋</span>
                </button>
                <div className="faq-a" id={`faq-panel-${index}`}>
                  <div className="inner">{faq.a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>
            把想法变成畅销的<span>产品</span>
          </h2>
          <a className="btn" href="#hero-form">
            免费开始构建
          </a>
        </div>
      </section>

      <footer>
        <div className="container">
          <div className="foot-grid">
            <div className="foot-brand">
              <AtomsLogo />
              <p>把想法变成可销售的产品</p>
            </div>
            <div className="foot-cols">
              <div className="foot-col">
                <h4>产品</h4>
                <a href="#team">AI Agents</a>
                <a href="#pricing">模型</a>
                <a href="#builds">工具</a>
                <a href="#faq">帮助中心</a>
                <Link href="/dashboard">我的项目</Link>
              </div>
              <div className="foot-col">
                <h4>发现</h4>
                <a href="#stories">用例</a>
                <a href="#pricing">比较</a>
                <a href="#everything">博客</a>
                <a href="https://github.com" target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </div>
              <div className="foot-col">
                <h4>公司</h4>
                <a href="#team">关于我们</a>
                <a href="#team">MetaGPT</a>
                <a href="#team">OpenManus</a>
                <a href="#team">Foundation Agents</a>
                <a href="#faq">隐私政策</a>
                <a href="#faq">服务条款</a>
                <a href="#hero-form">探索者计划</a>
              </div>
            </div>
            <div className="foot-col">
              <h4>关注我们</h4>
              <div className="foot-social">
                <a href="https://x.com" target="_blank" rel="noreferrer" aria-label="X / Twitter">
                  <svg viewBox="0 0 1024 1024" aria-hidden="true">
                    <path d="M541.568 373.376L756.224 128h130.304L601.92 453.312 936.768 896H674.56L469.248 627.52 234.24 896H103.872l304.512-347.904L87.04 128h268.8l185.6 245.376z m168.96 444.608h72.192L316.8 201.92H239.168l471.296 616.128z" />
                  </svg>
                </a>
                <a href="https://www.linkedin.com" target="_blank" rel="noreferrer" aria-label="LinkedIn">
                  <svg viewBox="0 0 1024 1024" aria-hidden="true">
                    <path d="M775.552 563.584c0-71.488-55.488-128.256-117.376-128.256-47.232 0-89.024 0-116.8 59.84-5.12 11.008-11.008 43.136-11.008 59.072v308.736H380.16v-585.6h155.904l7.68 76.288h3.328c22.528-36.224 73.728-76.288 166.016-76.288 112.448 0 213.312 89.024 213.312 252.288v333.312h-150.912V563.584z m-597.504-355.84c-49.088 0-80.768-34.752-80.768-77.696 0-43.968 32.64-77.696 82.816-77.696 50.112 0 80.768 33.728 81.792 77.696 0 42.944-31.68 77.696-83.84 77.696z m-62.72 655.232v-585.6h131.84v585.6h-131.84z" />
                  </svg>
                </a>
                <a href="https://discord.com" target="_blank" rel="noreferrer" aria-label="Discord">
                  <svg viewBox="0 0 1024 1024" aria-hidden="true">
                    <path d="M823.616 229.44a738.88 738.88 0 0 0-185.216-57.024c-8.128 14.08-17.216 33.024-23.552 48a707.84 707.84 0 0 0-205.12 0c-6.4-14.976-15.872-33.92-23.552-48-65.216 10.88-127.232 30.336-185.28 57.024C83.648 402.432 51.968 571.328 67.84 737.984a754.752 754.752 0 0 0 226.944 113.6 551.68 551.68 0 0 0 48.448-78.336 474.88 474.88 0 0 1-76.544-36.672c6.4-4.48 12.672-9.472 18.56-14.464 147.648 67.456 307.52 67.456 453.312 0 6.336 4.992 12.16 9.984 18.56 14.464a474.752 474.752 0 0 1-76.544 36.672c14.08 27.648 30.336 53.888 48.448 78.336a750.592 750.592 0 0 0 226.88-113.6c19.52-192.896-30.784-360.448-132.224-508.544zM363.52 635.2c-44.352 0-80.64-40.32-80.64-89.664s35.392-89.664 80.64-89.664c44.8 0 81.536 40.32 80.64 89.6 0 49.408-35.84 89.728-80.64 89.728z m297.6 0c-44.416 0-80.704-40.32-80.704-89.664s35.392-89.664 80.64-89.664c44.8 0 81.472 40.32 80.64 89.6 0 49.408-35.392 89.728-80.64 89.728z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Atoms. 把想法变成可销售的产品</span>
            <span className="lang">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm4.9 6.4h-2a11 11 0 0 0-.9-3.6 5.4 5.4 0 0 1 2.9 3.6zM8 2.6c.7.9 1.4 2.4 1.6 4.8H6.4C6.6 5 7.3 3.5 8 2.6zM3.1 7.4a5.4 5.4 0 0 1 2.9-3.6 11 11 0 0 0-.9 3.6h-2zm0 1.2h2c.1 1.4.4 2.6.9 3.6a5.4 5.4 0 0 1-2.9-3.6zm4.9 4.8c-.7-.9-1.4-2.4-1.6-4.8h3.2c-.2 2.4-.9 3.9-1.6 4.8zm2-.7c.5-1 .8-2.2.9-3.4h2a5.4 5.4 0 0 1-2.9 3.4z" />
              </svg>
              中文
            </span>
          </div>
        </div>
      </footer>

      {tipOpen && (
        <div className="float-tip">
          <button type="button" className="close" aria-label="关闭提示" onClick={() => setTipOpen(false)}>
            ✕
          </button>
          <div className="em">✦</div>
          <div>
            <b>准备好构建了吗？</b>描述你的想法，AI 团队立即开工。
          </div>
        </div>
      )}
    </div>
  );
}
