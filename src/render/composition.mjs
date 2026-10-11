import React from "react";
import {AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, Sequence, useCurrentFrame} from "remotion";
import {BrowserFrame, CursorHighlight, EndCard, FeatureCallout, PhoneFrame, ResultCard, StepLabel, SubtitleTrack, TitleCard} from "./components.mjs";

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

function Scene({scene, theme, assetSources, logoSrc}) {
  const frame = useCurrentFrame();
  const src = scene.asset_ids.length > 0 ? assetSources[scene.asset_ids[0]] : null;
  let content;
  if (scene.component === "title") content = h(TitleCard, {text: scene.on_screen_text, theme});
  else if (scene.component === "browser") content = h(BrowserFrame, {src, text: scene.on_screen_text, theme});
  else if (scene.component === "phone") content = h(PhoneFrame, {src, text: scene.on_screen_text, theme});
  else if (scene.component === "result") content = h(ResultCard, {text: scene.on_screen_text, theme});
  else if (scene.component === "end") content = h(EndCard, {text: scene.on_screen_text, logoSrc, theme});
  else content = h(AbsoluteFill, {style: {backgroundColor: theme.background}}, src ? h(BrowserFrame, {src, text: null, theme}) : null, h(FeatureCallout, {text: scene.on_screen_text, theme}));
  const motion = scene.motion;
  const enter = motion.entrance_frames === 0 ? 1 : interpolate(frame, [0, motion.entrance_frames], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const exitStart = scene.duration_frames - motion.exit_frames;
  const leave = motion.exit_frames === 0 ? 1 : motion.exit_frames === 1 ? (frame >= scene.duration_frames - 1 ? 0 : 1) : interpolate(frame, [exitStart, scene.duration_frames - 1], [1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const opacity = (motion.entrance === "fade" ? enter : 1) * (motion.exit === "fade" ? leave : 1);
  const transform = motion.entrance === "slide-up" ? `translateY(${(1 - enter) * 36}px)` : motion.entrance === "scale" ? `scale(${0.94 + enter * 0.06})` : motion.emphasis === "pulse" ? `scale(${1 + Math.sin(frame / 4) * 0.01})` : "none";
  return h(AbsoluteFill, {style: {opacity, transform}}, content, scene.highlight ? h(CursorHighlight, {...scene.highlight, theme}) : null, scene.step_label ? h(StepLabel, {text: scene.step_label, theme}) : null, scene.subtitle ? h(SubtitleTrack, {text: scene.subtitle, theme}) : null);
}

export function StudioComposition({scenes, theme, asset_sources: assetSources, logo_src: logoSrc}) {
  const fontFace = theme.font_src ? h("style", null, `@font-face{font-family:'KeelokitStudioPinnedFont';src:url('${theme.font_src}');font-display:block;}`) : null;
  return h(AbsoluteFill, {style: {backgroundColor: theme.background}}, h(PinnedFont, {src: theme.font_src ?? null}), fontFace, ...scenes.map((scene) => h(Sequence, {key: scene.scene_id, from: scene.from_frame, durationInFrames: scene.duration_frames}, h(Scene, {scene, theme, assetSources, logoSrc}))));
}
