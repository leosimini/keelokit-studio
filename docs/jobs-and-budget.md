# Paid jobs and budget

Paid provider work uses an exact request hash, configured currency, approved limit and maximum attempts. A successful persisted job is reused. An uncertain job is returned as `query-required` and cannot be submitted again until a provider query records a terminal result.

Known provider costs update the persisted engagement total once per job. Unknown cost remains `null`; Studio does not invent pricing. Retrying one job does not invalidate unrelated capture, render or voice work.
