import React from "react";
import {Composition, registerRoot} from "remotion";
import {StudioComposition} from "./composition.mjs";

const h = React.createElement;
const defaultProps = {
  width: 320,
  height: 180,
  fps: 30,
  duration_in_frames: 30,
  theme: {background: "#111111", foreground: "#ffffff", accent: "#5b8cff", surface: "#242424", subtitle_background: "#000000", font_family: "sans-serif", font_source: {type: "system", asset_id: null}, title_px: 30, body_px: 18, subtitle_px: 16, safe_padding: 18},
  scenes: [{scene_id: "default", component: "title", from_frame: 0, duration_frames: 30, on_screen_text: "Preview", asset_ids: [], subtitle: "", step_label: null, highlight: null}],
  asset_sources: {},
  logo_src: null
};

const Root = () => h(Composition, {
  id: "KeelokitStudioPiece",
  component: StudioComposition,
  durationInFrames: defaultProps.duration_in_frames,
  fps: defaultProps.fps,
  width: defaultProps.width,
  height: defaultProps.height,
  defaultProps,
  calculateMetadata: ({props}) => ({width: props.width, height: props.height, fps: props.fps, durationInFrames: props.duration_in_frames})
});

registerRoot(Root);
