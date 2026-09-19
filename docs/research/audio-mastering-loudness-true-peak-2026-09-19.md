# Audio Mastering loudness and true-peak metering architecture

**Research date:** 2026-09-19  
**Scope:** Ledger 24, 55, 65–67, 69, and any export/mastering gate that depends on loudness or true peak.  
**Decision target:** Wayfinder ticket “Define standards-correct loudness and true-peak metering architecture”.

## Standards baseline

Implement against the **current in-force standards**, not drafts:

- **ITU-R BS.1770-5 (11/2023)** — Algorithms to measure audio programme loudness and true-peak audio level. ITU still lists BS.1770-5 as the in-force main recommendation.
- **EBU R 128 v5.0 (11/2023)** — loudness normalisation and permitted maximum audio level.
- **EBU Tech 3341 v4.0 (11/2023)** — EBU Mode metering.
- **EBU Tech 3342 v4.0 (11/2023)** — Loudness Range.
- **Report ITU-R BS.2217-2** and **EBU Loudness Test Set v5.0** — compliance/reference material.

A preliminary draft revision of BS.1770-5 was posted by ITU working-party material in August 2026, but it is not an approved/in-force recommendation and is restricted. Do not implement unpublished draft behavior.

Primary sources:
- https://www.itu.int/rec/R-REC-BS.1770
- https://www.itu.int/rec/R-REC-BS.1770-5-202311-I
- https://tech.ebu.ch/publications/r128
- https://tech.ebu.ch/publications/tech3341
- https://tech.ebu.ch/publications/tech3342
- https://www.itu.int/pub/R-REP-BS.2217
- https://tech.ebu.ch/publications/ebu_loudness_test_set

## Decision

Build **one deterministic loudness/peak analysis kernel** shared by offline scanning and realtime display. The authoritative project/export values come from the offline worker scan of the exact rendered revision; realtime meters are responsive views over the same algorithms, not a separate approximation that can disagree silently.

### Execution lanes

- **Dedicated DSP worker:** authoritative integrated loudness, LRA, maximum true peak, peak/RMS/crest logs, and export/mastering scans.
- **Realtime preview:** block-fed state for Momentary/Short-term and live true-peak display. If custom processing is needed on the audio render thread, AudioWorklet may gather bounded block data, but standards math and retained history stay outside the worklet.
- **Main thread:** display/orchestration only.
- **Final export verification:** rescan the actual post-processing render when a nonlinear processor/limiter changes the waveform.

This follows the separately resolved worker architecture and prevents a long BS.1770 scan from blocking React.

## BS.1770 loudness kernel

### K-weighting

For each included channel:

1. apply the BS.1770 two-stage K-weighting filter;
2. compute mean-square power;
3. apply the standard channel weighting;
4. combine channel energies before conversion to loudness.

For the ordinary mono/stereo workstation path, left/right weights are 1.0. If multichannel support later exceeds the current mono/stereo track scope, use the exact BS.1770-5 channel weights and explicitly exclude LFE from compliant programme loudness until the governing standard changes.

Do not hard-code the published 48 kHz filter coefficients for every source sample rate. BS.1770-5 states those coefficients are for 48 kHz and implementations at other sample rates must preserve the specified frequency response. The implementation must therefore either derive/validate equivalent coefficients at the working rate or use a separately validated resampling analysis path; it may not silently apply the 48 kHz coefficients to 44.1/88.2/96 kHz material.

### Integrated loudness

Use BS.1770-5 gating exactly:

- gating block: **400 ms**;
- overlap: **75%** (100 ms step);
- discard an incomplete final gating block;
- first/absolute threshold: **−70 LKFS/LUFS**;
- calculate absolute-gated programme loudness;
- second/relative threshold: **10 dB/LU below** that absolute-gated result;
- integrated loudness is calculated from blocks above both thresholds.

The project UI should label the EBU-facing absolute unit **LUFS** while retaining test equivalence to the BS.1770 LKFS formulation.

Primary source:
- Recommendation ITU-R BS.1770-5, Annex 1.

## EBU Mode display windows

Use the current Tech 3341 definitions:

- **Momentary (M):** sliding rectangular **0.4 s** window, **not gated**.
- **Short-term (S):** sliding rectangular **3 s** window, **not gated**.
- live Short-term updates: at least **10 Hz**.
- **Integrated (I):** BS.1770 gated result; live update at least **1 Hz**.
- do not add an extra attack/release smoothing stage when the UI calls the mode “EBU Mode”.

Maintain Max M and Max S for the active measurement run and reset them together with Integrated/LRA when the user resets the meter.

Primary source:
- EBU Tech 3341 v4.0, §§2.1–2.3.

## Loudness Range (LRA)

Follow EBU Tech 3342:

1. compute ungated Short-term loudness from sliding **3 s** windows at **≥10 Hz**;
2. absolute gate at **−70 LUFS**;
3. compute the absolute-gated loudness of the retained Short-term distribution;
4. relative gate at **−20 LU** below that absolute-gated value;
5. retain values above both gates;
6. LRA is the difference between the **95th** and **10th** percentile estimates of that retained distribution.

For file-based measurements, follow the Tech 3342 handling needed to obtain the final Short-term analysis window at programme end; do not let a missing tail window silently shrink the distribution.

Primary source:
- EBU Tech 3342 v4.0.

## True peak

Use BS.1770-5 Annex 2 as the minimum reference algorithm.

At a 48 kHz input:
- estimate the continuous waveform with **4× oversampling to at least 192 kHz**;
- use a suitable low-pass/interpolation filter meeting the standard behavior;
- take the maximum absolute reconstructed value;
- report **dBTP**.

At higher input sample rates, use a proportionally lower interpolation ratio only when the resulting oversampled rate and filter performance provide similar or superior accuracy. BS.1770-5 explicitly notes that 96 kHz input can use 2× oversampling as an example.

Use floating-point processing so the Annex 2 integer-headroom attenuation step is not required as an implementation artifact.

### True-peak limiter boundary

Ledger 55 is a **processor**, not merely a meter. Its detector must use the same validated true-peak reconstruction principle, but the limiter itself additionally needs:
- lookahead;
- gain-envelope behavior;
- release policy;
- ceiling;
- proof that the **post-limiter output** meets the requested ceiling under reference/adversarial material.

Never mark the limiter complete just because the pre/post meter reports sample peak.

## Loudness normalization (ledger 24)

Normalization is a deterministic project operation:

1. scan the selected scope/revision with the BS.1770 integrated kernel;
2. calculate linear gain from the user-selected target loudness;
3. predict the linear-gain true peak from the measured true peak;
4. if predicted peak exceeds the selected ceiling, disclose it before commit and offer:
   - gain-only normalization with the resulting peak clearly shown; or
   - limiter-constrained normalization when ledger 55 is available;
5. after any nonlinear limiting/saturation, rescan the rendered result because loudness and true peak can no longer be inferred by a constant offset alone.

Do not hard-code −23 LUFS as the only mastering target. EBU R128's −23 LUFS remains an available standards preset; the workstation should also permit user-selected targets for non-broadcast workflows while clearly distinguishing them from “EBU R128 target”.

## Loudness-matched A/B (ledger 69)

Use the same measurement kernel for both A and B.

- For whole-track/reference comparison, calculate the compensation from integrated loudness over the common comparison scope.
- Apply comparison gain only in the audition path; never mutate either source/project.
- Recompute when the selected comparison scope/revision changes.
- For segments too short to yield a stable/meaningful integrated comparison, show that limitation rather than silently substitute a different quantity under an “integrated loudness match” label. A separate explicitly labeled short-term match mode may be added later.

## Peak / RMS / crest (ledger 67)

Keep sample peak, true peak, RMS, and crest factor as distinct metrics:

- sample peak = largest discrete sample magnitude;
- true peak = BS.1770-style reconstructed maximum;
- RMS = root-mean-square over the documented analysis window/scope;
- crest factor = peak-to-RMS ratio using an explicitly stated peak basis (default UI should distinguish sample-crest and true-peak crest if both are offered).

Do not relabel RMS as loudness.

## State and cache model

Authoritative measurements are derived data keyed by at least:

- `sourceId`;
- project/render `revisionId`;
- scope/range;
- channel routing/downmix definition;
- analysis standard/version;
- sample rate.

Cache:
- 400 ms block energies / sufficient statistics for integrated recalculation;
- 3 s short-term values for LRA and graphing;
- true-peak maxima/log segments;
- peak/RMS/crest summary.

Do not store these arrays inside the undoable project document. They are invalidatable worker caches and can be rebuilt.

A pure gain change may permit mathematically safe reuse/offset of some statistics, but correctness is preferred over clever cache mutation. Nonlinear processing, resampling, channel changes, or edits invalidate affected measurements.

## Compliance and acceptance gate

A home-grown meter is not accepted based on unit math alone.

Before ledger 24/65/66/67 or “EBU Mode” copy is considered complete:

1. run the official **EBU Loudness Test Set v5.0** against the implementation;
2. run applicable **ITU-R BS.2217-2** compliance files;
3. meet the expected tolerances stated by those references;
4. exercise the EBU Tech 3341 true-peak test signals 15–23, whose expected readings include the stated **+0.2/−0.4 dBTP** tolerance;
5. verify mono/stereo, silence, near-silence, gated material, inter-sample peaks, and non-48-kHz sample rates;
6. prove offline and realtime paths agree for the same completed measurement interval within defined tolerance;
7. prove reset/start/pause/continue semantics for Integrated + LRA;
8. verify stale worker results cannot overwrite a newer project revision.

EBU publishes a 70-file v5.0 test set intended for Tech 3341/3342 compliance checks. ITU-R BS.2217-2 remains the in-force ITU compliance-material report referenced by BS.1770.

## UI language

Use standards-specific labels only when the active mode meets them:

- “Integrated loudness — LUFS”
- “Momentary — LUFS”
- “Short-term — LUFS”
- “Loudness range — LU”
- “Maximum true peak — dBTP”
- “EBU Mode” only when the Tech 3341 timing/gating/display semantics are actually active.

A user-selected target such as −14 LUFS is a mastering target, not “EBU R128 normalization”.

## Consequences for the ledger

This resolves the standards and computation architecture for:
- 24 RMS/loudness normalization;
- 55 true-peak limiter detector/verification boundary;
- 65 BS.1770/R128 loudness/LRA;
- 66 true-peak meter log;
- 67 peak/RMS/crest;
- 69 loudness-matched A/B.

No ledger item is advanced by this research alone. Implementation must still pass the official/reference-vector gates above.
