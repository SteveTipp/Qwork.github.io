# Six-Bit Interference Analysis Note

## Fixed Dataset And Target

- Fixed input result: `data/Shors_ECC_6_Bit_Key_0.json`
- Analysis-only workflow: `prepare.py` writes `runs/prepared_result.json`; `analyze.py` writes `runs/latest_analysis.json`
- Modular ridge target: `a + k*b ≡ 0 (mod 64)`
- Fixed constants: `order = 64`, `true_k = 42`

## Mapping Sweep

| Mapping | best_k | true_rank | score_gap_true_minus_best_false | z_separation_true_k |
| --- | ---: | ---: | ---: | ---: |
| `split_left_right_reverse_each_half` | 32 | 28 | -1.0881e-06 | 0.002945 |
| `split_left_right_no_reversal` | 0 | 30 | -1.1426e-06 | -0.173365 |
| `swap_halves_reverse_each_half` | 32 | 32 | -2.9504e-06 | -0.269242 |
| `swap_halves_no_reversal` | 0 | 20 | -3.1261e-06 | -0.044064 |

Recommended mapping: `split_left_right_reverse_each_half`.
Reason: it gave the only positive `z_separation_true_k` and the least-negative true-vs-best-false gap, matching the primary optimization metric more closely than the alternatives.

## Staged Post-Analysis Tests

All staged tests used the fixed mapping above and the same candidate set `k in {0, ..., 63}`.

| Stage | Description | best_k | true_rank | score_gap_true_minus_best_false | z_separation_true_k |
| --- | --- | ---: | ---: | ---: | ---: |
| 0 | Raw exact-line baseline | 32 | 43 | -4.0894e-03 | -0.342364 |
| 1 | Toroidal `3x3` smoothing + exact-line `sum p(a,b)` | 32 | 30 | -1.8853e-03 | -0.151751 |
| 2 | Toroidal `3x3` smoothing + weighted exact-line `sum p(a,b)^2` | 32 | 28 | -1.0881e-06 | 0.002945 |
| 3 | Thin banded ridge test, modular distance `<= 1` | 32 | 38 | -3.3459e-06 | -0.341296 |
| 4 | Matched-filter exact-ridge overlap test | 32 | 30 | -1.8853e-03 | -0.151751 |
| 5 | Residual symmetry removal for `k=0` and `k=32`, then weighted exact-line scoring | 31 | 32 | -1.2176e-06 | 0.132044 |
| 6 | Fourier / harmonic filtering removing DC and half-modulus components, then weighted exact-line scoring | 47 | 26 | -4.1587e-07 | 0.093137 |
| 7 | Parity-sector analysis, best sector = `even-odd` | 32 | 18 | -7.1618e-07 | 0.977435 |
| 8 | Sparse top-point capped-weight analysis on the `even-odd` sector | 32 | 13 | -5.6997e-07 | 1.013537 |
| 9 | Null-model normalization on the capped-weight `even-odd` sector | 30 | 47 | -9.4955e-01 | -0.060951 |
| 10 | Row-centered positive residual on the capped-weight `even-odd` sector | 40 | 3 | -3.6299e-08 | 1.347784 |

Outcome summary:

- Smoothing improved the raw exact-line baseline.
- Weighted exact-line scoring improved the unsmoothed baseline.
- Thin banding degraded both single-run and bootstrap behavior.
- Matched-filter exact-ridge overlap also underperformed the weighted exact-line baseline.
- Residual symmetry removal improved `z_separation_true_k` but not rank.
- Fourier / harmonic filtering improved `true_rank` and the true-vs-best-false gap.
- Parity-sector analysis identified the `even-odd` sector as the strongest sectoral view.
- Sparse top-point capped-weight scoring on that `even-odd` sector improved the Method 3 parity result.
- Null-model normalization is informative rather than successful: it suppresses `k = 32`, but it also degrades the standing of `k = 42`, so it is not promoted over Method 4.
- Row-centered positive residual scoring on top of Method 4 is the current best-supported 6-bit post-analysis mode so far.

## Parity-Sector Comparison

| Sector | best_k | true_rank | score_gap_true_minus_best_false | z_separation_true_k | top-1 | top-3 | top-5 | true_rank mean | true_rank std | z-sep mean | z-sep std |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `even-even` | 16 | 36 | -6.3275e-07 | -0.087048 | 0.0000 | 0.0000 | 0.0000 | 33.6060 | 12.1352 | -0.0744 | 0.4926 |
| `even-odd` | 32 | 18 | -7.1618e-07 | 0.977435 | 0.0000 | 0.0020 | 0.0160 | 17.4480 | 6.1780 | 0.9705 | 0.1159 |
| `odd-even` | 0 | 43 | 0.0000 | 0.000000 | 0.0000 | 0.0000 | 0.0000 | 43.0000 | 0.0000 | 0.0000 | 0.0000 |
| `odd-odd` | 47 | 54 | -2.9727e-06 | -1.002892 | 0.0000 | 0.0000 | 0.0000 | 54.0000 | 0.0000 | -0.9997 | 0.0028 |

Best-supported parity sector so far: `even-odd`.
Reason: it gives the best `true_rank`, the strongest `z_separation_true_k`, and the best bootstrap top-3 / top-5 support among the four simple parity sectors.
Figure reference: `runs/even_odd_parity_sector_ridge_comparison.svg` visualizes the earlier even-odd parity-sector view before the Method 4 and Method 6 refinements, comparing the true ridge `k=42` against `best_k=32` after toroidal `3x3` smoothing.

## Current Best Single-Run Metrics

Current best pipeline:

- Fixed mapping: `split_left_right_reverse_each_half`
- Toroidal `3x3` smoothing
- Parity-sector mask: `a` even, `b` odd
- Capped-weight weighted exact-line ridge scoring on the exact modular ridge
- Cap rule: each per-cell ridge contribution uses `min(p(a,b)^2, q_0.90)` within the nonzero `even-odd` sector weights
- Row-centered positive residual applied to the capped even-odd grid before exact-line scoring

Current lead figure: `runs/method6_row_centered_even_odd_ridge_comparison.svg`

Current best single-run metrics:

- `best_k = 40`
- `true_rank = 3`
- `score_gap_true_minus_best_false = -3.6299e-08`
- `z_separation_true_k = 1.347784`

## Bootstrap Robustness For Current Best Pipeline

- `top-1 rate = 0.0000`
- `top-3 rate = 0.1420`
- `top-5 rate = 0.2460`
- `true_rank mean = 11.4880`
- `true_rank std = 7.3145`
- `z_separation_true_k mean = 1.1788`
- `z_separation_true_k std = 0.3054`

## Dominant False-Candidate Findings

Final Method 6 top candidate states:

- Rank 1: `k = 40`, score `= 2.0367889068618322e-07`
- Rank 2: `k = 30`, score `= 1.9577212551217755e-07`
- Rank 3: `k = 42`, score `= 1.6738035080862451e-07` (true key)

Across bootstrap replicates:

- Rank-1 winner frequency table, top 5: `k=40: 182/500 (0.364)`, `k=30: 118/500 (0.236)`, `k=38: 43/500 (0.086)`, `k=42: 21/500 (0.042)`, `k=0: 18/500 (0.036)`
- Most frequent candidates above `k = 42`: `[40, 30, 0, 38, 12]`
- `avg_score_gap_true_minus_top_false = -5.27308227811986e-08`
- Competition pattern is **diffuse**, not dominated.

Interpretation:

- In the final single run, the true key rises to rank 3, with only `k = 40` and `k = 30` above it.
- In bootstrap, those two states recur most often, but the above-true competition remains spread across many false candidates rather than collapsing to one dominant impostor.

## Geometric Competitor Interpretation

Competitors analyzed: `k = 40, 30` relative to `k = 42`.

- Exact ridge overlap with `k = 42` is low:
  - `k = 40: 2/64 = 0.03125`
  - `k = 30: 4/64 = 0.0625`
- Active-support overlap on the final Method 6 processed grid is zero for both competitors:
  - `k = 40: 0/14 = 0.0`
  - `k = 30: 0/14 = 0.0`
- Ridge-intensity correlation with the true ridge on the final processed grid is essentially zero and slightly negative:
  - `k = 40: -0.0021`
  - `k = 30: -0.0024`
- Top-contributor overlap is absent:
  - neither `k = 40` nor `k = 30` shares any of the true ridge top-5 contributing points.
- Structural comparison:
  - the true ridge is centered most strongly on row `a = 22`,
  - `k = 40` is centered on row `a = 24`,
  - `k = 30` is centered on row `a = 42`,
  - so the false competitors are not geometrically close to the true ridge and are best interpreted as different structured modes rather than nearby deformations of the true ridge.

## Main Conclusion

The current best-supported 6-bit post-analysis result is Method 6: the `even-odd` parity sector with toroidal `3x3` smoothing, capped-weight weighted exact-line ridge scoring, and a row-centered positive residual. In this mode, `k = 42` improves substantially relative to the full-grid baseline: `true_rank` improves to `3`, the bootstrap mean rank improves to `11.4880`, and the bootstrap mean `z_separation_true_k` rises to `1.1788`.

Method 5 null-model normalization was still informative because it suppressed the row-concentrated false competitor `k = 32`, but it also degraded the standing of `k = 42`, so it is not promoted over Method 4.

The final caveat is unchanged in substance: `best_k` is still not `42`; under Method 6 it is `40`. So the ridge-based post-processing family now provides a materially stronger signal for `k = 42`, but it still does not achieve robust direct recovery of the true key as the top-ranked candidate.
