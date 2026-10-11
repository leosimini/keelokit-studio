import React from "react";
import {AbsoluteFill, Img} from "remotion";
import {cameraAt, easeValue, fitRect, mixHex, pathAt, project, readableOn, viewTransform} from "./geometry.mjs";

const h = React.createElement;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const rise = (frame, start, length) => easeValue("ease-out", (frame - start) / length);

function base(theme, extra = {}) {
  return {fontFamily: theme.font_family, color: theme.foreground, ...extra};
}

// A calm backdrop: the theme background with a soft accent glow and an edge vignette, never a flat fill.
export function Backdrop({theme}) {
  return h(AbsoluteFill, {style: {backgroundColor: theme.background, backgroundImage: `radial-gradient(ellipse at 18% 8%, ${mixHex(theme.background, theme.accent, 0.22)} 0%, rgba(0,0,0,0) 55%), radial-gradient(ellipse at 50% 120%, ${mixHex(theme.background, "#000000", 0.45)} 0%, rgba(0,0,0,0) 60%)`}});
}

// Text is centred in a full-width row so it can use the whole frame (an absolutely positioned child at left: 50% could only use half).
export function CaptionBar({text, theme, layout}) {
  if (!text || !layout) return null;
  return h("div", {style: {position: "absolute", left: 0, right: 0, bottom: layout.bottom, display: "flex", justifyContent: "center"}},
    h("div", {style: base(theme, {maxWidth: layout.width, boxSizing: "border-box", padding: `${theme.subtitle_px * 0.45}px ${theme.subtitle_px}px`, borderRadius: theme.subtitle_px * 0.6, backgroundColor: `${theme.subtitle_background}b8`, fontSize: theme.subtitle_px, lineHeight: 1.35, textAlign: "center", textWrap: "balance"})}, text));
}

// The scene's headline: a compact chip above the stage, or a large panel beside a phone in a wide frame.
export function StepLabel({text, theme, layout, frame = 99}) {
  if (!text || !layout) return null;
  const t = rise(frame, 4, 10);
  if (layout.mode === "panel") {
    return h("div", {style: base(theme, {position: "absolute", left: layout.left, top: layout.top, width: layout.width, height: layout.height, display: "flex", flexDirection: "column", justifyContent: "center", gap: layout.fontPx * 0.45, opacity: t, transform: `translateX(${(1 - t) * -24}px)`})},
      h("div", {style: {width: layout.fontPx * 1.6, height: Math.max(5, layout.fontPx * 0.1), borderRadius: 999, backgroundColor: theme.accent}}),
      h("div", {style: {fontSize: layout.fontPx, fontWeight: 800, lineHeight: 1.12, textWrap: "balance"}}, text));
  }
  return h("div", {style: {position: "absolute", left: 0, right: 0, top: layout.top, display: "flex", justifyContent: "center"}},
    h("div", {style: base(theme, {maxWidth: layout.width, boxSizing: "border-box", transform: `translateY(${(1 - t) * -12}px)`, opacity: t, padding: `${layout.fontPx * 0.45}px ${layout.fontPx * 1.1}px`, borderRadius: layout.fontPx * 0.8, backgroundColor: theme.surface, borderLeft: `${Math.max(5, layout.fontPx * 0.22)}px solid ${theme.accent}`, fontSize: layout.fontPx, lineHeight: 1.3, fontWeight: 700, boxShadow: "0 10px 30px rgba(0,0,0,0.35)", textWrap: "balance"})}, text));
}

export function CursorHighlight({x, y, theme}) {
  return h("div", {style: {position: "absolute", left: `${x}%`, top: `${y}%`, width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: "50%", border: `5px solid ${theme.accent}`, boxShadow: `0 0 0 8px ${theme.surface}`}});
}

function Callout({callout, frame, stage, view, theme}) {
  const appear = rise(frame, callout.start_frame, 8);
  const disappear = 1 - rise(frame, callout.end_frame - 8, 8);
  const visible = frame >= callout.start_frame && frame < callout.end_frame;
  if (!visible) return null;
  const p = Math.min(appear, disappear);
  const topLeft = project(stage, view, callout.region.x, callout.region.y);
  const bottomRight = project(stage, view, callout.region.x + callout.region.width, callout.region.y + callout.region.height);
  const width = bottomRight.x - topLeft.x;
  const heightPx = bottomRight.y - topLeft.y;
  const stroke = Math.max(3, stage.width * 0.0035);
  const rect = {position: "absolute", left: topLeft.x, top: topLeft.y, width, height: heightPx, boxSizing: "border-box", borderRadius: Math.max(8, stage.width * 0.008), opacity: p, transform: `scale(${0.94 + 0.06 * p})`};
  const chipPx = Math.max(13, theme.body_px * 0.8);
  const chipHeight = chipPx * 2;
  const below = bottomRight.y + 10 + chipHeight < stage.height;
  const chip = callout.label ? h("div", {style: base(theme, {position: "absolute", left: Math.min(Math.max(8, topLeft.x), Math.max(8, stage.width - callout.label.length * chipPx * 0.62 - 24)), top: below ? bottomRight.y + 10 : Math.max(8, topLeft.y - chipHeight - 10), padding: `${chipPx * 0.4}px ${chipPx * 0.8}px`, borderRadius: chipPx * 0.6, backgroundColor: theme.accent, color: readableOn(theme.accent), fontSize: chipPx, fontWeight: 700, whiteSpace: "nowrap", opacity: p, boxShadow: "0 6px 18px rgba(0,0,0,0.35)"})}, callout.label) : null;
  const marker = callout.style === "spotlight"
    ? h("div", {style: {...rect, boxShadow: `0 0 0 ${Math.max(stage.width, stage.height) * 2}px rgba(0,0,0,${0.58 * p})`, outline: `${stroke}px solid ${theme.accent}`}})
    : h("div", {style: {...rect, border: `${stroke}px solid ${theme.accent}`, backgroundColor: `${theme.accent}22`}});
  return h(React.Fragment, null, marker, chip);
}

function Pointer({frame, cursor, stage, view, theme}) {
  const position = pathAt(cursor.points, frame);
  const point = project(stage, view, position.x, position.y);
  const size = Math.max(20, stage.width * 0.024);
  const clicked = cursor.click_frame !== null && frame >= cursor.click_frame;
  const clickT = clicked ? clamp01((frame - cursor.click_frame) / 14) : 0;
  const press = clicked && clickT < 0.35 ? 0.88 : 1;
  const ripple = clicked && clickT < 1 ? h("div", {style: {position: "absolute", left: point.x - size * 1.2 * clickT * 1.5, top: point.y - size * 1.2 * clickT * 1.5, width: size * 2.4 * clickT * 1.5, height: size * 2.4 * clickT * 1.5, borderRadius: "50%", border: `${Math.max(2, size * 0.12)}px solid ${theme.accent}`, opacity: 1 - clickT}}) : null;
  return h(React.Fragment, null, ripple,
    h("svg", {width: size, height: size * 1.4, viewBox: "0 0 14 20", style: {position: "absolute", left: point.x, top: point.y, transform: `scale(${press})`, transformOrigin: "0 0", filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.55))"}}, h("path", {d: "M0.5 0.5 L0.5 15.5 L4.4 12 L7.2 18.8 L9.7 17.7 L6.9 11 L12.5 11 Z", fill: "#ffffff", stroke: "#111111", strokeWidth: 1.1, strokeLinejoin: "round"})));
}

// The visible part of a verified asset. Camera, callouts and cursor are expressed in 0..1 asset coordinates, so they stay attached to the content as it zooms.
export function AssetStage({src, size, camera, callouts = [], cursor = null, frame, theme, radius = 0}) {
  const state = cameraAt(camera, frame);
  const view = viewTransform(size, state);
  return h("div", {style: {position: "relative", width: size.width, height: size.height, overflow: "hidden", borderRadius: radius, backgroundColor: theme.surface}},
    h(Img, {src, style: {position: "absolute", left: view.tx, top: view.ty, width: size.width * view.scale, height: size.height * view.scale, maxWidth: "none"}}),
    ...callouts.map((callout, index) => h(Callout, {key: index, callout, frame, stage: size, view, theme})),
    cursor ? h(Pointer, {cursor, frame, stage: size, view, theme}) : null);
}

function shadow() { return "0 34px 90px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.35)"; }

export function BrowserFrame({src, dims, area, scene, theme, frame}) {
  const chrome = Math.min(40, Math.max(22, area.width * 0.028));
  const size = fitRect({width: area.width, height: area.height - chrome}, dims);
  const dot = chrome * 0.3;
  return h("div", {style: {position: "absolute", left: area.left + (area.width - size.width) / 2, top: area.top + (area.height - size.height - chrome) / 2, width: size.width, borderRadius: chrome * 0.5, overflow: "hidden", boxShadow: shadow(), border: `1px solid ${mixHex(theme.surface, theme.foreground, 0.2)}`, backgroundColor: theme.surface}},
    h("div", {style: {height: chrome, display: "flex", alignItems: "center", gap: dot * 0.7, padding: `0 ${chrome * 0.5}px`, backgroundColor: mixHex(theme.surface, theme.foreground, 0.1)}}, ...["#ff5f57", "#febc2e", "#28c840"].map((color) => h("div", {key: color, style: {width: dot, height: dot, borderRadius: "50%", backgroundColor: color}}))),
    h(AssetStage, {src, size, camera: scene.motion.camera, callouts: scene.motion.callouts, cursor: scene.motion.cursor, frame, theme}));
}

export function PhoneFrame({src, dims, area, scene, theme, frame}) {
  const bezel = Math.min(14, Math.max(6, area.height * 0.012));
  const size = fitRect({width: Math.min(area.width * 0.92, area.height * 0.62), height: area.height - 2 * bezel}, dims);
  const radius = size.width * 0.11;
  return h("div", {style: {position: "absolute", left: area.left + (area.width - size.width - 2 * bezel) / 2, top: area.top + (area.height - size.height - 2 * bezel) / 2, padding: bezel, borderRadius: radius + bezel, backgroundColor: mixHex(theme.surface, "#000000", 0.55), boxShadow: shadow(), border: `1px solid ${mixHex(theme.surface, theme.foreground, 0.28)}`}},
    h(AssetStage, {src, size, camera: scene.motion.camera, callouts: scene.motion.callouts, cursor: scene.motion.cursor, frame, theme, radius}));
}

// A bare, rounded view of the asset under a large headline, for scenes that lead with the message.
export function FeatureFrame({src, dims, area, scene, theme, frame}) {
  const headline = scene.on_screen_text;
  const headlinePx = theme.title_px;
  const headlineHeight = headline ? headlinePx * 1.15 * Math.max(1, Math.ceil((headline.length * headlinePx * 0.5) / area.width)) + theme.safe_padding : 0;
  const t = rise(frame, 2, 12);
  const stageArea = {left: area.left, top: area.top + headlineHeight, width: area.width, height: area.height - headlineHeight};
  const size = src ? fitRect({width: stageArea.width, height: stageArea.height}, dims) : null;
  return h(React.Fragment, null,
    headline ? h("div", {style: base(theme, {position: "absolute", left: area.left, top: area.top, width: area.width, fontSize: headlinePx, fontWeight: 800, lineHeight: 1.1, opacity: t, transform: `translateY(${(1 - t) * 18}px)`})}, headline) : null,
    size ? h("div", {style: {position: "absolute", left: stageArea.left + (stageArea.width - size.width) / 2, top: stageArea.top + (stageArea.height - size.height) / 2, boxShadow: shadow(), borderRadius: 16, overflow: "hidden"}}, h(AssetStage, {src, size, camera: scene.motion.camera, callouts: scene.motion.callouts, cursor: scene.motion.cursor, frame, theme, radius: 16})) : null);
}

function Centered({theme, children}) {
  return h(AbsoluteFill, {style: base(theme, {alignItems: "center", justifyContent: "center", padding: theme.safe_padding * 1.5, gap: theme.title_px * 0.5})}, children);
}

export function TitleCard({text, theme, frame}) {
  const t = rise(frame, 0, 14);
  const bar = rise(frame, 6, 16);
  return h(Centered, {theme},
    h("h1", {style: {fontSize: theme.title_px * 1.25, lineHeight: 1.08, margin: 0, textAlign: "center", fontWeight: 800, maxWidth: "88%", textWrap: "balance", opacity: t, transform: `translateY(${(1 - t) * 24}px)`}}, text),
    h("div", {style: {height: Math.max(5, theme.title_px * 0.1), width: `${bar * 18}%`, borderRadius: 999, backgroundColor: theme.accent}}));
}

export function ResultCard({text, theme, frame}) {
  const t = rise(frame, 0, 14);
  const check = rise(frame, 8, 14);
  const size = theme.title_px * 1.5;
  return h(Centered, {theme},
    h("div", {style: {display: "flex", alignItems: "center", gap: theme.title_px * 0.6, padding: `${theme.title_px * 0.6}px ${theme.title_px * 0.9}px`, borderRadius: theme.title_px * 0.6, backgroundColor: theme.surface, border: `${Math.max(3, theme.title_px * 0.07)}px solid ${theme.accent}`, boxShadow: shadow(), maxWidth: "100%", opacity: t, transform: `scale(${0.94 + 0.06 * t})`}},
      h("svg", {width: size, height: size, viewBox: "0 0 24 24", style: {flex: "none"}}, h("circle", {cx: 12, cy: 12, r: 11, fill: theme.accent}), h("path", {d: "M6.5 12.5 L10.5 16.5 L17.5 8.5", fill: "none", stroke: readableOn(theme.accent), strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", strokeDasharray: 20, strokeDashoffset: 20 * (1 - check)})),
      h("div", {style: {fontSize: theme.title_px, fontWeight: 700, lineHeight: 1.15, textWrap: "balance"}}, text)));
}

export function EndCard({text, logoSrc = null, theme, frame}) {
  const t = rise(frame, 0, 14);
  return h(Centered, {theme},
    logoSrc ? h(Img, {src: logoSrc, style: {maxWidth: "34%", maxHeight: "26%", objectFit: "contain", opacity: t}}) : null,
    h("div", {style: {fontSize: theme.title_px, fontWeight: 800, textAlign: "center", padding: `${theme.title_px * 0.35}px ${theme.title_px * 0.9}px`, borderRadius: 999, backgroundColor: theme.accent, color: readableOn(theme.accent), maxWidth: "88%", opacity: t, transform: `translateY(${(1 - t) * 16}px)`}}, text));
}
