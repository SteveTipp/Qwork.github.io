# Five-Bit Interference Analysis Note

## 1) Corrected Bitstring-to-(a,b) Mapping

Data source is fixed: `data/Shors_ECC_5_Bit_Key_0.json`.

Current `prepare.py` mapping:
- Split each 10-bit key into two 5-bit halves: `left = bits[:5]`, `right = bits[5:]`.
- **Swap halves**.
- **Do not reverse** bit order inside either half.
- Convert directly: `a = int(right, 2)`, `b = int(left, 2)`.

This mapping is used to build `runs/prepared_result.json`.

## 2) Progression of Analysis Improvements

All stages use ridge family `a + k b ≡ 0 (mod 32)`, `k ∈ {0,...,31}`, evaluated at `true_k = 7`.

| Stage | Method change | best_k | true_rank | gap(true - best_false) | z_separation_true_k |
|---|---|---:|---:|---:|---:|
| Raw baseline | Original mapping + exact-line sum | 0 | 26 | -0.03875732421875 | -0.49891186462154014 |
| Corrected mapping baseline | Swap halves, no reversal + exact-line sum | 0 | 8 | -0.01361083984375 | 0.23917497180906144 |
| Toroidal smoothing | Add toroidal 3x3 box smoothing before scoring | 0 | 3 | -0.006083170572916664 | 0.6385353502668066 |
| Weighted exact-line scoring (final) | Keep exact ridge; score `sum p(a,b)^2` on ridge | 0 | 3 | -0.000012662077759519034 | 1.0331175218810753 |

## 3) Final Single-Run Metrics

From `runs/latest_analysis.json`:
- `best_k = 0`
- `true_rank = 3`
- `score_gap_true_minus_best_false = -1.2662077759519034e-05`
- `z_separation_true_k = 1.0331175218810753`

## 4) Bootstrap Robustness Metrics

Bootstrap configuration:
- Replicates: `500`
- Seed: `12345`
- Resample from observed grid distribution, then rerun the **same** smoothing + weighted exact-line pipeline.

Results:
- `true_k_rank_1_rate = 0.0`
- `true_k_top_3_rate = 0.472`
- `true_k_top_5_rate = 0.806`
- `true_rank_mean = 4.114`
- `true_rank_std = 1.581456290891405`
- `z_separation_true_k_mean = 1.033128547005442`
- `z_separation_true_k_std = 0.241619411969828`

## 5) Dominant False-Candidate Findings

Across bootstrap replicates:
- Rank-1 winner frequency: `k=0` wins `500/500` (`1.0`).
- Most frequent candidates above `k=7`: `[0, 16, 14, 21, 31]`.
- Average gap to top false across bootstrap:
  - `avg_score_gap_true_minus_top_false = -1.2413845753964083e-05`
- Competition pattern is **dominated**, not diffuse.

## 6) Geometric Competitor Interpretation

Competitors analyzed: `k = 0, 16, 14, 21, 31`.

- Ridge overlap with `k=7` is generally low:
  - `k=0: 0.03125`, `k=16: 0.03125`, `k=14: 0.03125`, `k=21: 0.0625`, `k=31: 0.25`.
- Ridge-intensity correlation with `k=7` (on smoothed grid, scored intensities) is low:
  - `k=0: 0.0139`, `k=16: 0.0208`, `k=14: 0.0200`, `k=21: 0.0402`, `k=31: 0.0596`.
- Dominance of `k=0` and `k=16` is best explained by:
  - **global marginal bias** (they are top-ranked by marginally expected ridge mass),
  - plus **concentration on a few especially strong ridge points**,
  - rather than substantial geometric overlap with the true ridge.

## Reproducibility

```bash
uv run python prepare.py
uv run python analyze.py
cat runs/latest_analysis.json
```
