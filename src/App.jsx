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
