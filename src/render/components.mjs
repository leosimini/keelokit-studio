import React from "react";
import {AbsoluteFill, Img} from "remotion";

const h = React.createElement;

function frameStyle(theme, extra = {}) {
  return {fontFamily: theme.font_family, color: theme.foreground, backgroundColor: theme.background, ...extra};
}

export function TitleCard({text, theme}) {
  return h(AbsoluteFill, {style: frameStyle(theme, {alignItems: "center", justifyContent: "center", padding: theme.safe_padding})}, h("h1", {style: {fontSize: theme.title_px, lineHeight: 1.05, margin: 0, textAlign: "center"}}, text));
}

export function BrowserFrame({src, text, theme}) {
  return h(AbsoluteFill, {style: frameStyle(theme, {padding: theme.safe_padding, justifyContent: "center"})},
    h("div", {style: {borderRadius: 18, overflow: "hidden", backgroundColor: theme.surface, border: `3px solid ${theme.accent}`}},
      h("div", {style: {height: 30, backgroundColor: theme.accent, opacity: 0.75}}),
      h(Img, {src, style: {display: "block", width: "100%", height: "auto", maxHeight: "70vh", objectFit: "contain"}})),
    text ? h(StepLabel, {text, theme}) : null);
}

export function PhoneFrame({src, text, theme}) {
  return h(AbsoluteFill, {style: frameStyle(theme, {alignItems: "center", justifyContent: "center", padding: theme.safe_padding})},
    h("div", {style: {width: "42%", height: "82%", border: `8px solid ${theme.foreground}`, borderRadius: 34, overflow: "hidden", backgroundColor: theme.surface}}, h(Img, {src, style: {width: "100%", height: "100%", objectFit: "contain"}})),
    text ? h(StepLabel, {text, theme}) : null);
}

export function FeatureCallout({text, theme}) {
  return h("div", {style: {position: "absolute", left: theme.safe_padding, top: theme.safe_padding, maxWidth: "56%", padding: "18px 24px", borderRadius: 16, color: theme.foreground, backgroundColor: theme.surface, borderLeft: `8px solid ${theme.accent}`, fontFamily: theme.font_family, fontSize: theme.body_px}}, text);
}

export function CursorHighlight({x, y, theme}) {
  return h("div", {style: {position: "absolute", left: `${x}%`, top: `${y}%`, width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: "50%", border: `5px solid ${theme.accent}`, boxShadow: `0 0 0 8px ${theme.surface}`}});
}

export function StepLabel({text, theme}) {
  return h("div", {style: {position: "absolute", left: theme.safe_padding, right: theme.safe_padding, bottom: theme.safe_padding, padding: "14px 20px", borderRadius: 12, color: theme.foreground, backgroundColor: theme.surface, fontFamily: theme.font_family, fontSize: theme.body_px}}, text);
}

export function SubtitleTrack({text, theme}) {
  if (!text) return null;
  return h("div", {style: {position: "absolute", left: "12%", right: "12%", bottom: "4%", padding: "10px 16px", borderRadius: 8, color: theme.foreground, backgroundColor: theme.subtitle_background, fontFamily: theme.font_family, fontSize: theme.subtitle_px, textAlign: "center"}}, text);
}

export function ResultCard({text, theme}) {
  return h(AbsoluteFill, {style: frameStyle(theme, {alignItems: "center", justifyContent: "center", padding: theme.safe_padding})}, h("div", {style: {padding: 32, borderRadius: 20, backgroundColor: theme.surface, border: `4px solid ${theme.accent}`, fontSize: theme.title_px, textAlign: "center"}}, text));
}

export function EndCard({text, logoSrc = null, theme}) {
  return h(AbsoluteFill, {style: frameStyle(theme, {alignItems: "center", justifyContent: "center", gap: 24, padding: theme.safe_padding})},
    logoSrc ? h(Img, {src: logoSrc, style: {maxWidth: "36%", maxHeight: "28%", objectFit: "contain"}}) : null,
    h("div", {style: {fontSize: theme.title_px, textAlign: "center"}}, text));
}
