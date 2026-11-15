import type { Palette, PreviewKind } from "./showcase-data";

/**
 * 资源卡片的预览图：不依赖截图与外链图片，
 * 按 kind + palette 用绝对定位的色块拼出「应用首屏」。
 * 尺寸全部用百分比，卡片宽度变化时自动等比缩放。
 */

export function ShowcasePreview({
  kind,
  palette,
  seed,
}: {
  kind: PreviewKind;
  palette: Palette;
  seed: number;
}) {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: palette.bg, color: palette.ink }}
      aria-hidden
    >
      {kind === "site" ? <SitePreview p={palette} /> : null}
      {kind === "game" ? <GamePreview p={palette} seed={seed} /> : null}
      {kind === "shop" ? <ShopPreview p={palette} /> : null}
      {kind === "dash" ? <DashPreview p={palette} seed={seed} /> : null}
      {kind === "blog" ? <BlogPreview p={palette} /> : null}
      {kind === "card" ? <CardPreview p={palette} /> : null}
      {kind === "poster" ? <PosterPreview p={palette} /> : null}
      {kind === "mobile" ? <MobilePreview p={palette} /> : null}
    </div>
  );
}

function SitePreview({ p }: { p: Palette }) {
  return (
    <>
      <div style={{ position: "absolute", left: "6%", top: "6%", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.accent }} />
        <span style={{ width: 32, height: 4, background: p.ink, opacity: 0.75, borderRadius: 99 }} />
      </div>
      <div style={{ position: "absolute", right: "6%", top: "6.6%", display: "flex", gap: 9 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 15, height: 3, background: p.ink, opacity: 0.24, borderRadius: 99 }} />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          right: "6%",
          top: "19%",
          width: "32%",
          height: "38%",
          borderRadius: 10,
          background: `linear-gradient(150deg, ${p.accent}, ${p.soft})`,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", right: "-18%", bottom: "-26%", width: "76%", aspectRatio: "1", borderRadius: "50%", background: "rgba(255,255,255,0.42)" }} />
        <div style={{ position: "absolute", left: "12%", top: "16%", width: "42%", height: 4, borderRadius: 99, background: "rgba(255,255,255,0.75)" }} />
        <div style={{ position: "absolute", left: "12%", top: "30%", width: "28%", height: 4, borderRadius: 99, background: "rgba(255,255,255,0.4)" }} />
      </div>

      <div style={{ position: "absolute", left: "6%", top: "23%", width: "46%", height: "8%", background: p.ink, opacity: 0.88, borderRadius: 5 }} />
      <div style={{ position: "absolute", left: "6%", top: "34%", width: "33%", height: "8%", background: p.ink, opacity: 0.88, borderRadius: 5 }} />
      <div style={{ position: "absolute", left: "6%", top: "46%", width: "29%", height: "3%", background: p.ink, opacity: 0.26, borderRadius: 99 }} />
      <div style={{ position: "absolute", left: "6%", top: "53%", width: "19%", height: "8%", background: p.accent, borderRadius: 99 }} />

      <div style={{ position: "absolute", left: "6%", right: "6%", bottom: "8%", display: "flex", gap: 9 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: 32, background: p.soft, borderRadius: 8, padding: 5, display: "flex", gap: 5 }}>
            <div style={{ width: 18, borderRadius: 5, background: `linear-gradient(150deg, ${p.accent}, ${p.soft})`, opacity: 0.9 }} />
            <div style={{ flex: 1, paddingTop: 3 }}>
              <div style={{ width: "82%", height: 3, background: p.ink, opacity: 0.28, borderRadius: 99 }} />
              <div style={{ width: "56%", height: 3, background: p.ink, opacity: 0.14, borderRadius: 99, marginTop: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function GamePreview({ p, seed }: { p: Palette; seed: number }) {
  return (
    <>
      <div style={{ position: "absolute", left: "6%", top: "6%", display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: p.accent }} />
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", opacity: 0.85 }}>PLAY</span>
      </div>
      <div style={{ position: "absolute", right: "6%", top: "6.4%", fontSize: 9, opacity: 0.55 }}>SCORE {100 + seed * 9}</div>
      <div
        style={{
          position: "absolute",
          left: "6%",
          right: "6%",
          top: "15%",
          bottom: "8%",
          background: p.soft,
          borderRadius: 10,
          padding: 8,
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(5, 1fr)",
          gap: 3,
        }}
      >
        {Array.from({ length: 40 }, (_, i) => {
          const on = (i * 7 + seed * 3) % 13 < 5;
          const isToken = (i * 11 + seed) % 29 === 0;
          return (
            <span
              key={i}
              style={{
                borderRadius: isToken ? "50%" : 2,
                background: on || isToken ? p.accent : "transparent",
                opacity: on ? 0.85 : isToken ? 1 : 0,
              }}
            />
          );
        })}
      </div>
    </>
  );
}

function ShopPreview({ p }: { p: Palette }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: "42%",
          background: `linear-gradient(120deg, ${p.accent}, ${p.soft})`,
        }}
      />
      <div style={{ position: "absolute", left: "7%", top: "9%", width: "34%", height: "4.5%", background: "#fff", opacity: 0.92, borderRadius: 99 }} />
      <div style={{ position: "absolute", left: "7%", top: "17%", width: "24%", height: "3%", background: "#fff", opacity: 0.5, borderRadius: 99 }} />
      <div style={{ position: "absolute", left: "7%", top: "25%", width: "17%", height: "7%", background: p.ink, borderRadius: 99, opacity: 0.9 }} />
      <div
        style={{
          position: "absolute",
          right: "7%",
          top: "14%",
          width: "17%",
          height: "30%",
          borderRadius: 12,
          background: "rgba(255,255,255,0.88)",
          boxShadow: "0 8px 20px rgba(12,12,12,0.12)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "7%",
          right: "7%",
          bottom: "9%",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            style={{ height: 34, background: p.soft, borderRadius: 8, padding: 5, display: "flex", flexDirection: "column", gap: 4 }}
          >
            <div
              style={{
                flex: 1,
                borderRadius: 5,
                background: `linear-gradient(140deg, ${p.accent}, ${p.soft})`,
                opacity: i % 3 === 1 ? 0.6 : 0.9,
              }}
            />
            <div style={{ width: "70%", height: 3, background: p.ink, opacity: 0.18, borderRadius: 99 }} />
          </div>
        ))}
      </div>
    </>
  );
}

function DashPreview({ p, seed }: { p: Palette; seed: number }) {
  const bars = Array.from({ length: 9 }, (_, i) => 26 + ((i * (seed + 3) * 13) % 62));
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "13%", background: p.soft }} />
      <div style={{ position: "absolute", left: "4%", top: "8%", width: "5.4%", height: "4%", background: p.accent, borderRadius: 3 }} />
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{ position: "absolute", left: "4%", top: `${20 + i * 10}%`, width: "5.4%", height: "2.6%", background: p.ink, opacity: 0.16, borderRadius: 2 }}
        />
      ))}
      <div style={{ position: "absolute", left: "17%", right: "6%", top: "8%", display: "flex", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: 34, background: p.soft, borderRadius: 8, padding: 7 }}>
            <div style={{ width: "48%", height: 3, background: p.ink, opacity: 0.2, borderRadius: 99 }} />
            <div style={{ width: "62%", height: 6, marginTop: 6, borderRadius: 99, background: i === 0 ? p.accent : p.ink, opacity: i === 0 ? 1 : 0.65 }} />
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: "17%",
          right: "6%",
          top: "35%",
          bottom: "8%",
          background: p.soft,
          borderRadius: 8,
          padding: 10,
          display: "flex",
          alignItems: "flex-end",
          gap: 5,
        }}
      >
        {bars.map((h, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              background: p.accent,
              opacity: i === bars.length - 1 ? 1 : 0.45,
              borderRadius: "3px 3px 0 0",
            }}
          />
        ))}
      </div>
    </>
  );
}

function BlogPreview({ p }: { p: Palette }) {
  return (
    <>
      <div style={{ position: "absolute", left: "7%", top: "8%", display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.accent, opacity: 0.85 }} />
        <span style={{ width: 26, height: 3, background: p.ink, opacity: 0.3, borderRadius: 99 }} />
      </div>
      <div style={{ position: "absolute", left: "7%", top: "19%", width: "52%", height: "8%", background: p.ink, opacity: 0.85, borderRadius: 5 }} />
      <div style={{ position: "absolute", left: "7%", top: "30%", width: "40%", height: "8%", background: p.ink, opacity: 0.85, borderRadius: 5 }} />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{ position: "absolute", left: "7%", top: `${44 + i * 7}%`, width: i === 2 ? "42%" : "56%", height: "2.6%", background: p.ink, opacity: 0.2, borderRadius: 99 }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          right: "7%",
          top: "44%",
          width: "26%",
          height: "32%",
          borderRadius: 8,
          background: `linear-gradient(140deg, ${p.accent}, ${p.soft})`,
        }}
      />
      <div style={{ position: "absolute", left: "7%", bottom: "8%", width: "16%", height: "7%", background: p.accent, borderRadius: 99, opacity: 0.9 }} />
    </>
  );
}

function CardPreview({ p }: { p: Palette }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "17%",
          right: "17%",
          top: "17%",
          bottom: "17%",
          background: p.soft,
          borderRadius: 12,
          boxShadow: "0 10px 28px rgba(12,12,12,0.10)",
        }}
      />
      <div style={{ position: "absolute", left: "25%", top: "30%", width: "14%", aspectRatio: "1", borderRadius: "50%", background: p.accent, opacity: 0.9 }} />
      <div style={{ position: "absolute", left: "25%", top: "55%", width: "26%", height: "4%", background: p.ink, opacity: 0.85, borderRadius: 99 }} />
      <div style={{ position: "absolute", left: "25%", top: "62%", width: "17%", height: "2.6%", background: p.ink, opacity: 0.26, borderRadius: 99 }} />
      <div style={{ position: "absolute", left: "25%", top: "68%", display: "flex", gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 9, height: 9, borderRadius: 3, background: p.accent, opacity: 0.35 }} />
        ))}
      </div>
      <div style={{ position: "absolute", right: "23%", top: "55%", width: "10%", aspectRatio: "1", background: p.ink, opacity: 0.1, borderRadius: 4 }} />
    </>
  );
}

function PosterPreview({ p }: { p: Palette }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          right: "-8%",
          top: "6%",
          width: "54%",
          aspectRatio: "1",
          borderRadius: "50%",
          background: `radial-gradient(circle at 34% 30%, ${p.accent}, ${p.bg} 72%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "6%",
          top: "16%",
          width: "10%",
          aspectRatio: "1",
          borderRadius: "50%",
          border: `1px solid ${p.ink}`,
          opacity: 0.22,
        }}
      />
      <div style={{ position: "absolute", left: "7%", top: "17%", width: "46%", height: "6%", background: p.ink, opacity: 0.9, borderRadius: 4 }} />
      <div style={{ position: "absolute", left: "7%", top: "27%", width: "32%", height: "6%", background: p.ink, opacity: 0.9, borderRadius: 4 }} />
      <div style={{ position: "absolute", left: "7%", top: "40%", width: "26%", height: "2.6%", background: p.ink, opacity: 0.28, borderRadius: 99 }} />
      <div style={{ position: "absolute", left: "7%", top: "46%", width: "18%", height: "2.6%", background: p.ink, opacity: 0.18, borderRadius: 99 }} />
      <div style={{ position: "absolute", left: "7%", bottom: "9%", width: "19%", height: "7.5%", border: `1px solid ${p.ink}`, opacity: 0.4, borderRadius: 99 }} />
    </>
  );
}

function MobilePreview({ p }: { p: Palette }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "8%",
          bottom: "8%",
          width: "38%",
          transform: "translateX(-50%)",
          background: p.soft,
          border: "1px solid rgba(12,12,12,0.08)",
          borderRadius: 16,
          padding: 9,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.accent }} />
          <span style={{ width: 20, height: 3, background: p.ink, opacity: 0.4, borderRadius: 99 }} />
        </div>
        <div style={{ flex: 1, borderRadius: 8, background: p.bg, padding: 5 }}>
          <div style={{ width: "60%", height: 3, background: p.ink, opacity: 0.3, borderRadius: 99 }} />
          <div style={{ width: "40%", height: 3, background: p.ink, opacity: 0.15, borderRadius: 99, marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, borderRadius: 8, background: p.bg }} />
        <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 12, height: 10, borderRadius: 99, background: p.accent, opacity: 0.9 }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.ink, opacity: 0.12 }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.ink, opacity: 0.12 }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: "7%", top: "26%", width: "21%", height: "20%", borderRadius: 10, background: p.accent, opacity: 0.28 }} />
      <div style={{ position: "absolute", left: "7%", top: "51%", width: "17%", height: "13%", borderRadius: 10, background: p.ink, opacity: 0.08 }} />
      <div style={{ position: "absolute", right: "7%", top: "30%", width: "18%", height: "15%", borderRadius: 10, background: p.ink, opacity: 0.08 }} />
      <div style={{ position: "absolute", right: "7%", top: "50%", width: "21%", height: "20%", borderRadius: 10, background: p.accent, opacity: 0.2 }} />
    </>
  );
}
