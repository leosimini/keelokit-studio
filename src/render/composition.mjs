import React from "react";
import {AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, Sequence, useCurrentFrame, useVideoConfig} from "remotion";
import {Backdrop, BrowserFrame, CaptionBar, CursorHighlight, EndCard, FeatureFrame, PhoneFrame, ResultCard, StepLabel, TitleCard} from "./components.mjs";
import {sceneLayout} from "./geometry.mjs";

const h = React.createElement;

function PinnedFont({src}) {
  const [handle] = React.useState(() => src ? delayRender("Load pinned brand font") : null);
  React.useEffect(() => {
    if (!src || handle === null) return undefined;
    const font = new FontFace("KeelokitStudioPinnedFont", `url('${src}')`);
    font.load().then((loaded) => {
      document.fonts.add(loaded);
      continueRender(handle);
    }).catch((error) => cancelRender(error));
    return undefined;
  }, [handle, src]);
  return null;
}

const assetComponents = new Set(["browser", "phone", "feature"]);

function Scene({scene, theme, assetSources, assetDimensions, logoSrc, lead}) {
  const raw = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const frame = Math.max(0, raw - lead);
  const motion = scene.motion;
  const assetId = scene.asset_ids[0];
  const src = assetId !== undefined ? assetSources[assetId] : null;
  const dims = assetId !== undefined ? assetDimensions[assetId] : null;
  const showsAsset = assetComponents.has(scene.component) && src && dims;
  // Browser and phone scenes show their copy as a label; a feature scene leads with it as a headline.
  const label = scene.component === "feature" ? scene.step_label : (scene.step_label ?? (assetComponents.has(scene.component) ? scene.on_screen_text : null));
  const layout = sceneLayout({width, height, padding: theme.safe_padding, bodyPx: theme.body_px, subtitlePx: theme.subtitle_px, titlePx: theme.title_px, label, subtitle: scene.subtitle, panel: scene.component === "phone" && width > height * 1.2});
  const area = layout.stage;
  let content = null;
  if (scene.component === "title") content = h(TitleCard, {text: scene.on_screen_text, theme, frame});
  else if (scene.component === "result") content = h(ResultCard, {text: scene.on_screen_text, theme, frame});
  else if (scene.component === "end") content = h(EndCard, {text: scene.on_screen_text, logoSrc, theme, frame});
  else if (showsAsset && scene.component === "browser") content = h(BrowserFrame, {src, dims, area, scene, theme, frame});
  else if (showsAsset && scene.component === "phone") content = h(PhoneFrame, {src, dims, area, scene, theme, frame});
  else if (scene.component === "feature") content = h(FeatureFrame, {src: showsAsset ? src : null, dims, area, scene, theme, frame});
  const enter = motion.entrance_frames === 0 ? 1 : interpolate(frame, [0, motion.entrance_frames], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const exitStart = scene.duration_frames - motion.exit_frames;
  const leave = motion.exit_frames === 0 ? 1 : motion.exit_frames === 1 ? (frame >= scene.duration_frames - 1 ? 0 : 1) : interpolate(frame, [exitStart, scene.duration_frames - 1], [1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const crossfade = lead > 0 ? interpolate(raw, [0, lead], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}) : 1;
  const opacity = (motion.entrance === "fade" ? enter : 1) * (motion.exit === "fade" ? leave : 1) * crossfade;
  const entranceTransform = motion.entrance === "slide-up" ? `translateY(${(1 - enter) * 36}px)` : motion.entrance === "scale" ? `scale(${0.94 + enter * 0.06})` : "";
  const pulseTransform = motion.emphasis === "pulse" ? `scale(${1 + Math.sin(frame / 4) * 0.01})` : "";
  const transform = `${entranceTransform} ${pulseTransform}`.trim() || "none";
  const focusOverlay = motion.emphasis === "focus" ? h(AbsoluteFill, {"data-motion": "focus", style: {pointerEvents: "none", background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.5) 100%)"}}) : null;
  return h(AbsoluteFill, {style: {opacity, transform}}, h(Backdrop, {theme}), content, focusOverlay, scene.highlight ? h(CursorHighlight, {...scene.highlight, theme}) : null, h(StepLabel, {text: label, theme, layout: layout.label, frame}), h(CaptionBar, {text: scene.subtitle, theme, layout: layout.subtitle}));
}

export function StudioComposition({scenes, theme, asset_sources: assetSources, asset_dimensions: assetDimensions = {}, logo_src: logoSrc}) {
  const fontFace = theme.font_src ? h("style", null, `@font-face{font-family:'KeelokitStudioPinnedFont';src:url('${theme.font_src}');font-display:block;}`) : null;
  return h(AbsoluteFill, {style: {backgroundColor: theme.background}}, h(PinnedFont, {src: theme.font_src ?? null}), fontFace,
    ...scenes.map((scene) => {
      const lead = scene.motion.transition?.type === "crossfade" ? scene.motion.transition.frames : 0;
      return h(Sequence, {key: scene.scene_id, from: scene.from_frame - lead, durationInFrames: scene.duration_frames + lead}, h(Scene, {scene, theme, assetSources, assetDimensions, logoSrc, lead}));
    }));
}
