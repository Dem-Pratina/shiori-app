import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { BookOpen, Search, Plus, Minus, X, Pencil, Trash2, Clock, Library, ExternalLink, ImagePlus } from "lucide-react";

const FONT_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;700&family=Inter:wght@400;500;600&display=swap');
.font-display { font-family: 'Zilla Slab', serif; }
.font-body { font-family: 'Inter', sans-serif; }
`;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const PALETTE = ["#e8a33d", "#5b7c8d", "#c0685a", "#7c9473", "#8b7bb0", "#c99a4a"];
const colorFor = (str) => PALETTE[[...str].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const getTags = (s) => (Array.isArray(s.tags) ? s.tags : s.category ? [s.category] : []);

// --- storage: uses localStorage when available (e.g. once hosted as a real site),
// falls back to in-memory storage for this session if it isn't.
const memoryStore = {};
function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return key in memoryStore ? memoryStore[key] : null;
  }
}
function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    memoryStore[key] = value;
    return true;
  }
}
function storageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    delete memoryStore[key];
  }
}

// --- tabs + migration from the old single-library format ---
function loadTabs() {
  try {
    const raw = storageGet("shiori-tabs");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* fall through */
  }

  // migrate old data (single shared library) into a "มังฮวา" tab
  try {
    const oldSeries = storageGet("shiori-series");
    if (oldSeries) {
      const oldOpened = storageGet("shiori-opened");
      const tabId = uid();
      storageSet(`shiori-series-${tabId}`, oldSeries);
      storageSet(`shiori-opened-${tabId}`, oldOpened || "{}");
      const tabs = [{ id: tabId, name: "มังฮวา" }];
      storageSet("shiori-tabs", JSON.stringify(tabs));
      storageSet("shiori-active-tab", tabId);
      storageRemove("shiori-series");
      storageRemove("shiori-opened");
      return tabs;
    }
  } catch {
    /* fall through */
  }

  // fresh install: start with one empty tab
  const tabId = uid();
  const tabs = [{ id: tabId, name: "มังฮวา" }];
  storageSet("shiori-tabs", JSON.stringify(tabs));
  storageSet("shiori-active-tab", tabId);
  return tabs;
}

// --- number detection in a URL: returns [{ value, start, end }, ...]
function extractNumbers(str) {
  if (!str) return [];
  const out = [];
  const re = /\d+/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    out.push({ value: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function buildLink(s) {
  if (s.tracked) {
    const padded = String(s.episode ?? 0).padStart(s.padLength || 1, "0");
    return (s.linkTemplate || "").replace("{n}", padded);
  }
  return s.linkTemplate || "";
}

function displayProgress(s) {
  if (s.tracked) return `ตอนที่ ${String(s.episode ?? 0).padStart(s.padLength || 1, "0")}`;
  return s.note || "";
}

export default function Shiori() {
  const [tabs, setTabs] = useState(() => loadTabs());
  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      const saved = storageGet("shiori-active-tab");
      if (saved) return saved;
    } catch {
      /* ignore */
    }
    return null;
  });
  const [series, setSeries] = useState([]);
  const [opened, setOpened] = useState({});
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState([]);
  const [modal, setModal] = useState(null);
  const [tabModalOpen, setTabModalOpen] = useState(false);

  useEffect(() => {
    if (!activeTabId && tabs[0]) setActiveTabId(tabs[0].id);
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (!activeTabId) return;
    try {
      const raw = storageGet(`shiori-series-${activeTabId}`);
      setSeries(raw ? JSON.parse(raw) : []);
    } catch {
      setSeries([]);
    }
    try {
      const raw2 = storageGet(`shiori-opened-${activeTabId}`);
      setOpened(raw2 ? JSON.parse(raw2) : {});
    } catch {
      setOpened({});
    }
    setActiveTags([]);
    setQuery("");
  }, [activeTabId]);

  const saveSeries = useCallback(
    (next) => {
      setSeries(next);
      const ok = storageSet(`shiori-series-${activeTabId}`, JSON.stringify(next));
      if (!ok) setError("บันทึกไม่สำเร็จ ลองอีกครั้ง");
    },
    [activeTabId]
  );

  const saveOpened = useCallback(
    (next) => {
      setOpened(next);
      storageSet(`shiori-opened-${activeTabId}`, JSON.stringify(next));
    },
    [activeTabId]
  );

  function switchTab(id) {
    setActiveTabId(id);
    storageSet("shiori-active-tab", id);
  }

  function addTab(name) {
    const newTab = { id: uid(), name: name.trim() || "แท็บใหม่" };
    const next = [...tabs, newTab];
    setTabs(next);
    storageSet("shiori-tabs", JSON.stringify(next));
    switchTab(newTab.id);
    setTabModalOpen(false);
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const allTags = useMemo(() => {
    const set = new Set();
    series.forEach((s) => getTags(s).forEach((t) => set.add(t)));
    return Array.from(set);
  }, [series]);

  function toggleTag(t) {
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const filtered = useMemo(() => {
    return series.filter((s) => {
      const matchQ = s.title.toLowerCase().includes(query.toLowerCase());
      const tags = getTags(s);
      const matchT = activeTags.every((t) => tags.includes(t));
      return matchQ && matchT;
    });
  }, [series, query, activeTags]);

  const recent = useMemo(() => {
    return Object.entries(opened)
      .map(([id, o]) => ({ id, ...o, s: series.find((x) => x.id === id) }))
      .filter((x) => x.s)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 8);
  }, [series, opened]);

  function saveItem(data) {
    if (modal.mode === "add") {
      const item = { id: uid(), createdAt: Date.now(), ...data };
      saveSeries([item, ...series]);
    } else {
      saveSeries(series.map((s) => (s.id === modal.item.id ? { ...s, ...data } : s)));
    }
    setModal(null);
  }

  function deleteSeries(id) {
    saveSeries(series.filter((s) => s.id !== id));
    if (opened[id]) {
      const next = { ...opened };
      delete next[id];
      saveOpened(next);
    }
  }

  function openSeries(s) {
    const url = buildLink(s);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    saveOpened({ ...opened, [s.id]: { lastOpenedAt: Date.now() } });
  }

  function bumpEpisode(s, delta) {
    const next = Math.max(0, (s.episode ?? 0) + delta);
    saveSeries(series.map((x) => (x.id === s.id ? { ...x, episode: next } : x)));
  }

  return (
    <div className="min-h-screen font-body" style={{ backgroundColor: "#14171f", color: "#e8e4d9" }}>
      <style>{FONT_STYLE}</style>

      <header className="sticky top-0 z-20 border-b" style={{ backgroundColor: "#14171fee", borderColor: "#2a2f3c", backdropFilter: "blur(6px)" }}>
        <div className="max-w-5xl mx-auto px-5 pt-4">
          <div className="flex gap-2 overflow-x-auto pb-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium font-display"
                style={t.id === activeTabId ? { backgroundColor: "#e8a33d", color: "#14171f" } : { backgroundColor: "#1e2230", color: "#a8afc0", border: "1px solid #2a2f3c" }}
              >
                {t.name}
              </button>
            ))}
            <button
              onClick={() => setTabModalOpen(true)}
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#1e2230", color: "#a8afc0", border: "1px solid #2a2f3c" }}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-5 pb-4 flex items-center gap-3">
          <button
            onClick={() => setModal({ mode: "add" })}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium"
            style={{ backgroundColor: "#e8a33d", color: "#14171f" }}
          >
            <Plus size={16} /> เพิ่มเรื่อง
          </button>
          <div className="flex-1 relative min-w-[120px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#7a8194" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-md text-sm outline-none"
              style={{ backgroundColor: "#1e2230", color: "#e8e4d9", border: "1px solid #2a2f3c" }}
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6">
        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-md text-sm" style={{ backgroundColor: "#3a2020", color: "#f0b4b4" }}>
            {error}
          </div>
        )}

        {series.length === 0 && <EmptyState tabName={activeTab?.name} onAdd={() => setModal({ mode: "add" })} />}

        {series.length > 0 && (
          <>
            {recent.length > 0 && (
              <section className="mb-8">
                <SectionTitle icon={<Clock size={15} />} text="เปิดอ่านล่าสุด" />
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {recent.map((r) => (
                    <RecentCard key={r.id} data={r} onClick={() => openSeries(r.s)} />
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionTitle icon={<Library size={15} />} text="คลังของฉัน" />

              <div className="flex gap-2 flex-wrap mb-5">
                <Chip active={activeTags.length === 0} onClick={() => setActiveTags([])} text="ทั้งหมด" />
                {allTags.map((t) => (
                  <Chip key={t} active={activeTags.includes(t)} onClick={() => toggleTag(t)} text={t} />
                ))}
              </div>

              {filtered.length === 0 ? (
                <p className="text-sm py-10 text-center" style={{ color: "#7a8194" }}>ไม่พบเรื่องที่ค้นหา</p>
              ) : (
                <Grid items={filtered} onOpen={openSeries} onEdit={(s) => setModal({ mode: "edit", item: s })} onDelete={deleteSeries} onBump={bumpEpisode} />
              )}
            </section>
          </>
        )}
      </main>

      {modal && (
        <FormModal mode={modal.mode} item={modal.item} existingTags={allTags} onClose={() => setModal(null)} onSave={saveItem} />
      )}

      {tabModalOpen && <NewTabModal onClose={() => setTabModalOpen(false)} onCreate={addTab} />}
    </div>
  );
}

function NewTabModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ backgroundColor: "#000a" }}>
      <div className="w-full max-w-xs rounded-lg p-5" style={{ backgroundColor: "#1e2230", border: "1px solid #2a2f3c" }}>
        <h3 className="font-display text-lg font-bold mb-3" style={{ color: "#f0ead8" }}>ตั้งชื่อแท็บใหม่</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onCreate(name)}
          style={inputStyle}
          className="mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-md text-sm" style={{ backgroundColor: "#2a2f3c", color: "#e8e4d9" }}>ยกเลิก</button>
          <button
            onClick={() => name.trim() && onCreate(name)}
            disabled={!name.trim()}
            className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: "#e8a33d", color: "#14171f" }}
          >
            สร้าง
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, text }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs font-medium"
      style={active ? { backgroundColor: "#e8a33d", color: "#14171f" } : { backgroundColor: "#1e2230", color: "#a8afc0", border: "1px solid #2a2f3c" }}
    >
      {text}
    </button>
  );
}

function SectionTitle({ icon, text }) {
  return (
    <h2 className="font-display flex items-center gap-2 text-lg font-bold mb-3" style={{ color: "#f0ead8" }}>
      <span style={{ color: "#e8a33d" }}>{icon}</span> {text}
    </h2>
  );
}

function EmptyState({ tabName, onAdd }) {
  return (
    <div className="py-24 text-center">
      <BookOpen size={40} className="mx-auto mb-4" style={{ color: "#3a4155" }} />
      <p className="font-display text-xl font-bold mb-1" style={{ color: "#f0ead8" }}>{tabName ? `"${tabName}" ยังว่างอยู่` : "ยังว่างอยู่"}</p>
      <p className="text-sm mb-5" style={{ color: "#7a8194" }}>เพิ่มลิงก์เรื่องแรกที่คุณติดตามอยู่</p>
      <button onClick={onAdd} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium" style={{ backgroundColor: "#e8a33d", color: "#14171f" }}>
        <Plus size={16} /> เพิ่มเรื่อง
      </button>
    </div>
  );
}

function Cover({ s }) {
  if (s.coverUrl) {
    return <img src={s.coverUrl} alt={s.title} className="w-full h-full object-cover" />;
  }
  const tags = getTags(s);
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: colorFor(tags[0] || s.title) }}>
      <span className="font-display text-3xl font-bold" style={{ color: "#14171f" }}>{s.title.trim().charAt(0).toUpperCase()}</span>
    </div>
  );
}

function RecentCard({ data, onClick }) {
  const { s } = data;
  const progress = displayProgress(s);
  return (
    <button onClick={onClick} className="flex-shrink-0 w-32 text-left">
      <div className="w-32 h-44 rounded-md overflow-hidden mb-1.5" style={{ backgroundColor: "#1e2230" }}>
        <Cover s={s} />
      </div>
      <p className="text-xs font-medium truncate" style={{ color: "#e8e4d9" }}>{s.title}</p>
      {progress && <p className="text-[11px] truncate" style={{ color: "#7a8194" }}>{progress}</p>}
    </button>
  );
}

function Grid({ items, onOpen, onEdit, onDelete, onBump }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {items.map((s) => (
        <SeriesCard key={s.id} s={s} onOpen={() => onOpen(s)} onEdit={() => onEdit(s)} onDelete={() => onDelete(s.id)} onBump={(d) => onBump(s, d)} />
      ))}
    </div>
  );
}

function SeriesCard({ s, onOpen, onEdit, onDelete, onBump }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const tags = getTags(s);

  return (
    <div className="group relative">
      <button onClick={onOpen} className="w-full text-left">
        <div className="w-full aspect-[3/4] rounded-md overflow-hidden mb-1.5 relative" style={{ backgroundColor: "#1e2230" }}>
          <Cover s={s} />
          <div className="absolute top-1.5 right-1.5 p-1 rounded" style={{ backgroundColor: "#14171fcc" }}>
            <ExternalLink size={11} style={{ color: "#a8afc0" }} />
          </div>
        </div>
        <p className="text-sm font-medium truncate" style={{ color: "#e8e4d9" }}>{s.title}</p>
        {tags.length > 0 && <p className="text-[11px] truncate" style={{ color: "#7a8194" }}>{tags.join(" · ")}</p>}
        {!s.tracked && s.note && <p className="text-[11px] truncate" style={{ color: "#7a8194" }}>{s.note}</p>}
      </button>

      {s.tracked && (
        <div className="flex items-center justify-between mt-1 rounded-md overflow-hidden" style={{ backgroundColor: "#1e2230", border: "1px solid #2a2f3c" }}>
          <button onClick={(e) => { e.stopPropagation(); onBump(-1); }} className="px-2 py-1" style={{ color: "#a8afc0" }}>
            <Minus size={12} />
          </button>
          <span className="text-[11px] font-medium" style={{ color: "#e8e4d9" }}>{displayProgress(s)}</span>
          <button onClick={(e) => { e.stopPropagation(); onBump(1); }} className="px-2 py-1" style={{ color: "#e8a33d" }}>
            <Plus size={12} />
          </button>
        </div>
      )}

      <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1.5 rounded" style={{ backgroundColor: "#14171fcc" }}>
          <Pencil size={12} style={{ color: "#a8afc0" }} />
        </button>
        {!confirmDel && (
          <button onClick={() => setConfirmDel(true)} className="p-1.5 rounded" style={{ backgroundColor: "#14171fcc" }}>
            <Trash2 size={12} style={{ color: "#f0b4b4" }} />
          </button>
        )}
      </div>

      {confirmDel && (
        <div className="absolute bottom-8 left-1.5 right-1.5 flex gap-1">
          <button onClick={onDelete} className="text-[10px] flex-1 py-1 rounded" style={{ backgroundColor: "#c0392b", color: "#fff" }}>ลบ</button>
          <button onClick={() => setConfirmDel(false)} className="text-[10px] flex-1 py-1 rounded" style={{ backgroundColor: "#1e2230", color: "#e8e4d9" }}>ยกเลิก</button>
        </div>
      )}
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// --- pan-to-reposition cover cropper (no zoom): drag the image behind a fixed 3:4 frame
function CoverAdjustModal({ src, onCancel, onConfirm }) {
  const frameW = 220;
  const frameH = 293; // 3:4
  const outScale = 2;
  const imgElRef = useRef(null);
  const dragRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(frameW / img.width, frameH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      setSize({ w, h });
      setOffset({ x: (frameW - w) / 2, y: (frameH - h) / 2 });
      imgElRef.current = img;
      setReady(true);
    };
    img.src = src;
  }, [src]);

  function clamp(val, dim, frame) {
    const min = frame - dim;
    return Math.min(0, Math.max(min, val));
  }

  function onPointerDown(e) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({
      x: clamp(dragRef.current.baseX + dx, size.w, frameW),
      y: clamp(dragRef.current.baseY + dy, size.h, frameH),
    });
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function handleConfirm() {
    const canvas = document.createElement("canvas");
    canvas.width = frameW * outScale;
    canvas.height = frameH * outScale;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgElRef.current, offset.x * outScale, offset.y * outScale, size.w * outScale, size.h * outScale);
    onConfirm(canvas.toDataURL("image/jpeg", 0.82));
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: "#000c" }}>
      <div className="rounded-lg p-4" style={{ backgroundColor: "#1e2230", border: "1px solid #2a2f3c" }}>
        <p className="text-xs mb-3 text-center" style={{ color: "#a8afc0" }}>ลากรูปเพื่อจัดตำแหน่งให้พอดีกรอบ</p>
        <div
          className="relative overflow-hidden rounded-md mx-auto"
          style={{ width: frameW, height: frameH, backgroundColor: "#14171f", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {ready && (
            <img
              src={src}
              draggable={false}
              alt=""
              style={{ position: "absolute", left: offset.x, top: offset.y, width: size.w, height: size.h, userSelect: "none" }}
            />
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-2 rounded-md text-sm" style={{ backgroundColor: "#2a2f3c", color: "#e8e4d9" }}>ยกเลิก</button>
          <button onClick={handleConfirm} disabled={!ready} className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-40" style={{ backgroundColor: "#e8a33d", color: "#14171f" }}>
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  backgroundColor: "#14171f",
  color: "#e8e4d9",
  border: "1px solid #2a2f3c",
  borderRadius: "6px",
  padding: "8px 10px",
  fontSize: "13px",
  outline: "none",
};

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium mb-1" style={{ color: "#a8afc0" }}>{label}</label>
      {children}
    </div>
  );
}

function initialSelection(item, matches) {
  if (item && item.tracked && typeof item.episode === "number") {
    const idx = matches.findIndex((m) => Number(m.value) === item.episode);
    if (idx !== -1) return idx;
    return matches.length === 1 ? 0 : "skip";
  }
  if (item && item.tracked === false) {
    return matches.length === 1 ? 0 : matches.length === 0 ? null : "skip";
  }
  return matches.length === 1 ? 0 : null;
}

function TagInput({ tags, setTags, existingTags }) {
  const [text, setText] = useState("");

  function addTag(raw) {
    const t = raw.trim();
    if (!t || tags.includes(t)) {
      setText("");
      return;
    }
    setTags([...tags, t]);
    setText("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(text);
    } else if (e.key === "Backspace" && text === "" && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  const suggestions = existingTags.filter((t) => !tags.includes(t));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: "#e8a33d", color: "#14171f" }}>
            {t}
            <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} onBlur={() => text.trim() && addTag(text)} style={inputStyle} />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              className="px-2 py-0.5 rounded-full text-[11px]"
              style={{ backgroundColor: "#14171f", color: "#7a8194", border: "1px solid #2a2f3c" }}
            >
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormModal({ mode, item, existingTags, onClose, onSave }) {
  const [title, setTitle] = useState(item?.title || "");
  const [tags, setTags] = useState(() => getTags(item || {}));
  const [coverUrl, setCoverUrl] = useState(item?.coverUrl || "");
  const [note, setNote] = useState(item?.note || "");
  const [uploadMsg, setUploadMsg] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const fileInputRef = useRef(null);

  const initialRawLink = item ? buildLink(item) : "";
  const [rawLink, setRawLink] = useState(initialRawLink);
  const matches = useMemo(() => extractNumbers(rawLink), [rawLink]);
  const [selectedIdx, setSelectedIdx] = useState(() => initialSelection(item, extractNumbers(initialRawLink)));
  const [episode, setEpisode] = useState(item?.episode ?? (matches[0] ? Number(matches[0].value) : 0));
  const [padLength, setPadLength] = useState(item?.padLength ?? (matches[0] ? matches[0].value.length : 1));

  function handleLinkChange(value) {
    setRawLink(value);
    const m = extractNumbers(value);
    if (m.length === 1) {
      setSelectedIdx(0);
      setEpisode(Number(m[0].value));
      setPadLength(m[0].value.length);
    } else {
      setSelectedIdx(null);
    }
  }

  function pickMatch(i) {
    setSelectedIdx(i);
    setEpisode(Number(matches[i].value));
    setPadLength(matches[i].value.length);
  }

  const isAmbiguous = matches.length > 1 && selectedIdx === null;
  const canSave = title.trim() && rawLink.trim() && !isAmbiguous;

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadMsg("เลือกไฟล์รูปภาพเท่านั้น");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setPendingImage(dataUrl);
      setUploadMsg("");
    } catch {
      setUploadMsg("อ่านไฟล์ไม่สำเร็จ ลองรูปอื่น");
    }
  }

  function handleSave() {
    const base = { title: title.trim(), tags, coverUrl: coverUrl.trim() };
    if (typeof selectedIdx === "number") {
      const m = matches[selectedIdx];
      const linkTemplate = rawLink.slice(0, m.start) + "{n}" + rawLink.slice(m.end);
      onSave({ ...base, tracked: true, linkTemplate, episode: Math.max(0, Number(episode) || 0), padLength, note: "" });
    } else {
      onSave({ ...base, tracked: false, linkTemplate: rawLink.trim(), note: note.trim(), episode: undefined });
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ backgroundColor: "#000a" }}>
      <div className="w-full max-w-md rounded-lg p-5 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#1e2230", border: "1px solid #2a2f3c" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold" style={{ color: "#f0ead8" }}>
            {mode === "add" ? "เพิ่มเรื่องใหม่" : "แก้ไขข้อมูลเรื่อง"}
          </h3>
          <button onClick={onClose}><X size={18} style={{ color: "#7a8194" }} /></button>
        </div>

        <Field label="ชื่อเรื่อง">
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </Field>

        <Field label="ลิงก์เว็บที่อ่าน">
          <input value={rawLink} onChange={(e) => handleLinkChange(e.target.value)} style={inputStyle} />
        </Field>

        {matches.length === 1 && (
          <p className="text-[11px] -mt-2 mb-3" style={{ color: "#7c9473" }}>
            เจอเลขตอน {matches[0].value} ในลิงก์ ใช้เป็นเลขตอนอัตโนมัติ
          </p>
        )}

        {matches.length > 1 && (
          <div className="-mt-2 mb-3">
            <p className="text-[11px] mb-1.5" style={{ color: isAmbiguous ? "#e0a0a0" : "#a8afc0" }}>
              เจอตัวเลขหลายจุดในลิงก์นี้ แตะเลือกว่าอันไหนคือเลขตอน:
            </p>
            <div className="flex gap-1.5 flex-wrap items-center">
              {matches.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickMatch(i)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={selectedIdx === i ? { backgroundColor: "#e8a33d", color: "#14171f" } : { backgroundColor: "#14171f", color: "#a8afc0", border: "1px solid #2a2f3c" }}
                >
                  {m.value}
                </button>
              ))}
              <button type="button" onClick={() => setSelectedIdx("skip")} className="text-[11px] underline ml-1" style={{ color: "#7a8194" }}>
                ไม่ติดตามเลขตอน
              </button>
            </div>
          </div>
        )}

        {typeof selectedIdx === "number" ? (
          <Field label="เลขตอนปัจจุบัน">
            <input type="number" min="0" value={episode} onChange={(e) => setEpisode(e.target.value.replace(/[^0-9]/g, ""))} style={inputStyle} />
          </Field>
        ) : (
          <Field label="ตอน / บทที่อ่านล่าสุด">
            <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
          </Field>
        )}

        <Field label="แท็ก / หมวดหมู่">
          <TagInput tags={tags} setTags={setTags} existingTags={existingTags} />
        </Field>

        <Field label="รูปปก">
          <div className="flex gap-2 items-start">
            {coverUrl && (
              <div className="w-12 h-16 rounded overflow-hidden flex-shrink-0" style={{ backgroundColor: "#14171f" }}>
                <img src={coverUrl} alt="ตัวอย่างปก" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium"
                style={{ backgroundColor: "#2a2f3c", color: "#a8afc0", border: "1px solid #3a4155" }}
              >
                <ImagePlus size={13} /> อัพโหลด
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              {(uploadMsg || coverUrl) && (
                <p className="text-[11px] mt-1" style={{ color: uploadMsg ? "#e0a0a0" : "#7c9473" }}>
                  {uploadMsg}
                  {!uploadMsg && coverUrl && (
                    <button type="button" onClick={() => setCoverUrl("")} className="underline">
                      ลบรูป
                    </button>
                  )}
                </p>
              )}
            </div>
          </div>
        </Field>

        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-md text-sm" style={{ backgroundColor: "#2a2f3c", color: "#e8e4d9" }}>ยกเลิก</button>
          <button onClick={handleSave} disabled={!canSave} className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-40" style={{ backgroundColor: "#e8a33d", color: "#14171f" }}>
            บันทึก
          </button>
        </div>
      </div>

      {pendingImage && (
        <CoverAdjustModal
          src={pendingImage}
          onCancel={() => setPendingImage(null)}
          onConfirm={(dataUrl) => {
            setCoverUrl(dataUrl);
            setPendingImage(null);
          }}
        />
      )}
    </div>
  );
}
