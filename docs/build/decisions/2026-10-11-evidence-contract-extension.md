# Evidence contract extension during pre-release development

Date: 2026-10-11

Status: accepted for C03 before the first release.

C01 introduced the version-1 contract skeleton, while C03 owns working brand, evidence, capture, and asset behavior. C03-03 adds required `procedure_hash`, `surface`, `adapter`, and `verification` fields to product evidence so a browser capture cannot be represented as native evidence and a changed procedure cannot overwrite prior evidence.

This is a breaking extension of the unreleased `0.1.0` contract. There is no published Studio release, remote default-branch implementation, or consumer migration target. The two synthetic fixtures are updated in the same commit and clean installation remains part of every verification run. A second schema version would add migration machinery without an existing consumer, so the first release will establish this completed shape as version 1.

After the first release, required-field or semantic changes must introduce an explicit schema version and migration/compatibility path. New adapter names must be added only with implemented capability validation and a fixture for their actual surface.
