// @kiln/evidence: provenance, statistics, hashing, identity, records and verdicts — one implementation,
// shared by the workbench page, the server and the tests (guide Appendix B).
export {
  type Prov, type Value, type ValueOpts,
  observed, derived, heuristic, illustrative, missing,
  isValue, raw, num, isMissing, provOf, combine,
  seal, isSealed, ProvenanceError,
} from './values.ts';
export { type Summary, type SummarizeOpts, type Pair, type PairedSummary, median, quantile, rng, summarize, pairedRatio, separated } from './stats.ts';
export { type SampleCheck, repetitionOrder, checkSamples } from './protocol.ts';
export { sha256Hex, isSha256Hex } from './sha256.ts';
export { canonicalJSON, CanonicalJSONError } from './canonical.ts';
export { type Lang, type DeviceClass, type Fingerprint, type Launch, type ContentIdInput, canonicalSource, contentId, cudaDevice, deviceId, slug, isFingerprint } from './identity.ts';
export { type MeasurementRecord, type RecordContext, type TimingKind, type Validation, RECORD_FORMAT, recordId, validateRecord, validateContext, isDecisive } from './record.ts';
export { type Verdict, type Check, type SupportRecord, type VerdictInput, type VerdictResult, verdict, below, above } from './verdict.ts';
