import assert from "node:assert/strict";
import test from "node:test";
import {BriefValidationError, createAudienceMap, createBrief, renderBriefMarkdown} from "../src/agency/brief.mjs";

const sourceIds = ["source-manual", "source-research"];

function audienceCandidate(key, name, stage) {
  return {key, public_name: name, jobs: [`Complete ${key} task`], stage, vocabulary: [], objections: [], related_roles: [key], ctas: [`Start ${key} task`], source_ids: ["source-manual"], confirmation_status: "confirmed"};
}

function briefInput(audiences) {
  return {
    projectId: audiences.project_id,
    version: 1,
    audiences,
    knownSourceIds: sourceIds,
    objective: "activation",
    languages: {primary: "en-US", additional: []},
    audienceTreatments: audiences.audiences.map(({audience_id}, index) => ({
      audience_id,
      tone: {value: index === 0 ? "Direct and practical" : "Precise", basis: index === 0 ? "explicit" : "detected", confirmation_status: index === 0 ? "confirmed" : "proposed"},
      voice: {value: null, basis: "none", confirmation_status: "not-applicable"}
    })),
    messages: audiences.audiences.map(({audience_id, public_name}) => ({text: `${public_name} can complete its task`, language: "en-US", audience_ids: [audience_id], source_ids: ["source-manual"]})),
    channels: ["documentation"],
    visibility: "public",
    ui: {surfaces: ["web"], build: "build-42"},
    scope: {included: ["activation flow"], excluded: ["unreleased work"]},
    budget: {currency: null, limit: null},
    reviewers: ["product owner"],
    successCriteria: ["Audience can identify the next action"]
  };
}

test("audience maps use project-defined counts and stable internal IDs", () => {
  const one = createAudienceMap({projectId: "product-a", candidates: [audienceCandidate("member", "Members", "activation")]});
  const three = createAudienceMap({projectId: "product-b", candidates: [audienceCandidate("buyer", "Buyers", "evaluation"), audienceCandidate("operator", "Operators", "use"), audienceCandidate("developer", "Developers", "activation")]});
  assert.equal(one.audiences.length, 1);
  assert.equal(three.audiences.length, 3);
  assert.match(three.audiences[0].audience_id, /^audience-[a-f0-9]{16}$/);
  assert.notEqual(three.audiences[0].audience_id, three.audiences[1].audience_id);
});

test("brief keeps audience treatments distinct and renders a reviewable view", () => {
  const audiences = createAudienceMap({projectId: "product-b", candidates: [audienceCandidate("buyer", "Buyers", "evaluation"), audienceCandidate("operator", "Operators", "use")]});
  const brief = createBrief(briefInput(audiences));
  assert.equal(brief.audience_treatments[0].tone.confirmation_status, "confirmed");
  assert.equal(brief.audience_treatments[1].tone.confirmation_status, "proposed");
  const markdown = renderBriefMarkdown(brief, audiences, sourceIds);
  assert.match(markdown, /### Buyers/);
  assert.match(markdown, /Tone: Precise \(proposed\)/);
  assert.match(markdown, /audiences: Buyers; sources: source-manual/);
  assert.match(markdown, /Budget: unconfirmed/);
  assert.match(markdown, /Reviewers: product owner/);
});

test("detected tone or voice cannot be marked confirmed", () => {
  const audiences = createAudienceMap({projectId: "product-a", candidates: [audienceCandidate("member", "Members", "activation")]});
  const input = briefInput(audiences);
  input.audienceTreatments[0].tone = {value: "Detected style", basis: "detected", confirmation_status: "confirmed"};
  assert.throws(() => createBrief(input), BriefValidationError);
  const inconsistent = briefInput(audiences);
  inconsistent.audienceTreatments[0].voice = {value: "Narrator", basis: "explicit", confirmation_status: "not-applicable"};
  assert.throws(() => createBrief(inconsistent), BriefValidationError);
});

test("candidate input cannot override its stable internal audience ID", () => {
  const candidate = {...audienceCandidate("member", "Members", "activation"), audience_id: "public-name-as-id"};
  const audiences = createAudienceMap({projectId: "product-a", candidates: [candidate]});
  assert.match(audiences.audiences[0].audience_id, /^audience-[a-f0-9]{16}$/);
});

test("brief rejects unsupported messages and unknown audiences", () => {
  const audiences = createAudienceMap({projectId: "product-a", candidates: [audienceCandidate("member", "Members", "activation")]});
  const unsupported = briefInput(audiences);
  unsupported.messages[0].source_ids = ["source-unknown"];
  assert.throws(() => createBrief(unsupported), /unknown source/);
  const unknownAudience = briefInput(audiences);
  unknownAudience.audienceTreatments[0].audience_id = "audience-unknown";
  assert.throws(() => createBrief(unknownAudience), /unknown audience/);
});

test("brief rejects rejected, duplicate, and unsupported audience records", () => {
  const audiences = createAudienceMap({projectId: "product-a", candidates: [audienceCandidate("member", "Members", "activation")]});
  const rejected = structuredClone(audiences);
  rejected.audiences[0].confirmation_status = "rejected";
  assert.throws(() => createBrief({...briefInput(audiences), audiences: rejected}), /rejected audience/);
  const duplicate = structuredClone(audiences);
  duplicate.audiences.push({...duplicate.audiences[0], public_name: "Other name"});
  assert.throws(() => createBrief({...briefInput(audiences), audiences: duplicate}), /duplicate audience_id/);
  const unknownSource = structuredClone(audiences);
  unknownSource.audiences[0].source_ids = ["source-unknown"];
  assert.throws(() => createBrief({...briefInput(audiences), audiences: unknownSource}), /references unknown source/);
});

test("brief renderer revalidates project and cross-document references", () => {
  const audiences = createAudienceMap({projectId: "product-a", candidates: [audienceCandidate("member", "Members", "activation")]});
  const brief = createBrief(briefInput(audiences));
  const foreign = structuredClone(audiences);
  foreign.project_id = "other-product";
  assert.throws(() => renderBriefMarkdown(brief, foreign, sourceIds), /project_id must match/);
  const changed = structuredClone(brief);
  changed.messages[0].audience_ids = ["audience-unknown"];
  assert.throws(() => renderBriefMarkdown(changed, audiences, sourceIds), /untreated audience/);
});

test("review view exposes material budget, reviewer, and audience assignment changes", () => {
  const audiences = createAudienceMap({projectId: "product-b", candidates: [audienceCandidate("buyer", "Buyers", "evaluation"), audienceCandidate("operator", "Operators", "use")]});
  const first = createBrief(briefInput(audiences));
  const changedInput = briefInput(audiences);
  changedInput.budget = {currency: "USD", limit: 100000};
  changedInput.reviewers = ["other owner"];
  changedInput.messages[0].audience_ids = [audiences.audiences[1].audience_id];
  const second = createBrief(changedInput);
  const firstView = renderBriefMarkdown(first, audiences, sourceIds);
  const secondView = renderBriefMarkdown(second, audiences, sourceIds);
  assert.notEqual(firstView, secondView);
  assert.match(secondView, /Budget: USD 100000/);
  assert.match(secondView, /Reviewers: other owner/);
  assert.match(secondView, /audiences: Operators/);
});


test("a brief declares its languages and supports a message in each", () => {
  const audiences = createAudienceMap({projectId: "product-a", candidates: [audienceCandidate("member", "Members", "activation")]});
  const input = briefInput(audiences);
  assert.deepEqual(createBrief(input).languages, {primary: "en-US", additional: []});
  const { languages, ...withoutLanguages } = input;
  assert.throws(() => createBrief(withoutLanguages), BriefValidationError);
  assert.throws(() => createBrief({...input, languages: {primary: "en-US", additional: ["es-AR"]}}), /language es-AR has no supported message/);
  assert.throws(() => createBrief({...input, languages: {primary: "en-US", additional: ["en-US"]}}), /primary language/);
  assert.throws(() => createBrief({...input, messages: [{...input.messages[0], language: "fr-FR"}]}), /not a brief language/);
  const bilingual = createBrief({...input, languages: {primary: "en-US", additional: ["es-AR"]}, messages: [input.messages[0], {...input.messages[0], text: "Los miembros completan su tarea", language: "es-AR"}]});
  assert.match(renderBriefMarkdown(bilingual, audiences, sourceIds), /Languages: en-US, es-AR/);
});
