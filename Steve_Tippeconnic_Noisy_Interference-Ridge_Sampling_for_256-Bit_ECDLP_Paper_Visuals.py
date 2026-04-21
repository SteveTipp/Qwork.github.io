#!/usr/bin/env python3

# Imports
from __future__ import annotations
import math
from dataclasses import dataclass
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.gridspec import GridSpec
from matplotlib.patches import FancyArrowPatch, Rectangle
from PIL import Image, ImageColor, ImageDraw, ImageFont


# Shared setup
SECP256K1_ORDER = int(
    "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
    16,
)

FONT_PATHS = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
FONT_BOLD_PATHS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
WHITE = (255, 255, 255)
BLACK = (20, 20, 20)
GRAY = (120, 120, 120)
LIGHT_GRAY = (220, 220, 220)
BLUE = ImageColor.getrgb("#3366cc")
ORANGE = ImageColor.getrgb("#e78b2f")
GREEN = ImageColor.getrgb("#2a9d6f")
RED = ImageColor.getrgb("#d1495b")
PURPLE = ImageColor.getrgb("#6c4ad3")


# Plot geometry helper
@dataclass(frozen=True)
class PlotRegion:
    left: int
    top: int
    right: int
    bottom: int
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    x_scale: str = "linear"
    y_scale: str = "linear"

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top

    def x_to_px(self, value: float) -> float:
        if self.x_scale == "log":
            value = math.log10(value)
            min_v = math.log10(self.x_min)
            max_v = math.log10(self.x_max)
        else:
            min_v = self.x_min
            max_v = self.x_max
        return self.left + (value - min_v) / (max_v - min_v) * self.width

    def y_to_py(self, value: float) -> float:
        if self.y_scale == "log":
            value = math.log10(value)
            min_v = math.log10(self.y_min)
            max_v = math.log10(self.y_max)
        else:
            min_v = self.y_min
            max_v = self.y_max
        return self.bottom - (value - min_v) / (max_v - min_v) * self.height


# Output helper
def ensure_output_dir() -> Path:
    output_dir = Path(__file__).resolve().parent / "paper_visuals_output"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


# Font helper
def load_font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = FONT_BOLD_PATHS if bold else FONT_PATHS
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


# Drawing helpers
def draw_centered_text(draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str, font, fill=BLACK) -> None:
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=4)
    x = xy[0] - (bbox[2] - bbox[0]) / 2
    y = xy[1] - (bbox[3] - bbox[1]) / 2
    draw.multiline_text((x, y), text, font=font, fill=fill, spacing=4, align="center")


def sci_label(value: float) -> str:
    exponent = int(round(math.log10(value)))
    if abs(value - 10**exponent) / value < 1e-9:
        return f"1e{exponent}"
    return f"{value:.2g}"


def draw_axes(
    draw: ImageDraw.ImageDraw,
    region: PlotRegion,
    *,
    title: str,
    x_ticks: list[float],
    y_ticks: list[float],
    x_label: str,
    y_label: str,
    font_small,
    font_medium,
    x_label_offset: int = 22,
    y_label_mode: str = "top",
    y_label_x_offset: int = -92,
) -> None:
    draw.rectangle([region.left, region.top, region.right, region.bottom], outline=BLACK, width=2)
    draw.text((region.left, region.top - 38), title, font=font_medium, fill=BLACK)
    if x_label:
        bbox = draw.textbbox((0, 0), x_label, font=font_small)
        draw.text(
            (region.left + region.width / 2 - (bbox[2] - bbox[0]) / 2, region.bottom + x_label_offset),
            x_label,
            font=font_small,
            fill=BLACK,
        )
    if y_label:
        if y_label_mode == "vertical":
            bbox = draw.textbbox((0, 0), y_label, font=font_small)
            label_width = bbox[2] - bbox[0]
            label_height = bbox[3] - bbox[1]
            y_image = Image.new("RGBA", (label_width + 10, label_height + 10), (255, 255, 255, 0))
            y_draw = ImageDraw.Draw(y_image)
            y_draw.text((5, 5), y_label, font=font_small, fill=BLACK)
            y_rotated = y_image.rotate(90, expand=True)
            draw._image.paste(
                y_rotated,
                (region.left + y_label_x_offset, region.top + region.height // 2 - y_rotated.height // 2),
                y_rotated,
            )
        else:
            draw.text((region.left - 4, region.top - 70), y_label, font=font_small, fill=BLACK)

    for tick in x_ticks:
        x = region.x_to_px(tick)
        draw.line([(x, region.bottom), (x, region.bottom + 7)], fill=BLACK, width=1)
        draw.line([(x, region.top), (x, region.bottom)], fill=LIGHT_GRAY, width=1)
        label = sci_label(tick) if region.x_scale == "log" else f"{tick:g}"
        bbox = draw.textbbox((0, 0), label, font=font_small)
        draw.text((x - (bbox[2] - bbox[0]) / 2, region.bottom + 10), label, font=font_small, fill=BLACK)

    for tick in y_ticks:
        y = region.y_to_py(tick)
        draw.line([(region.left - 7, y), (region.left, y)], fill=BLACK, width=1)
        draw.line([(region.left, y), (region.right, y)], fill=LIGHT_GRAY, width=1)
        label = sci_label(tick) if region.y_scale == "log" else f"{tick:g}"
        bbox = draw.textbbox((0, 0), label, font=font_small)
        draw.text((region.left - (bbox[2] - bbox[0]) - 12, y - (bbox[3] - bbox[1]) / 2), label, font=font_small, fill=BLACK)


def draw_polyline(draw: ImageDraw.ImageDraw, region: PlotRegion, x_values: np.ndarray, y_values: np.ndarray, *, fill, width: int = 3) -> None:
    points = [
        (region.x_to_px(float(x)), region.y_to_py(float(y)))
        for x, y in zip(x_values, y_values)
        if y > 0
    ]
    if len(points) >= 2:
        draw.line(points, fill=fill, width=width, joint="curve")


def draw_legend(
    draw: ImageDraw.ImageDraw,
    entries: list[tuple[tuple[int, int, int], str]],
    *,
    x: int,
    y: int,
    font,
    line_width: int = 4,
) -> None:
    box_height = 24 * len(entries) + 18
    box_width = max(draw.textbbox((0, 0), text, font=font)[2] for _, text in entries) + 70
    draw.rounded_rectangle([x, y, x + box_width, y + box_height], radius=10, outline=BLACK, fill=WHITE, width=1)
    cursor_y = y + 12
    for color, text in entries:
        draw.line([(x + 14, cursor_y + 8), (x + 42, cursor_y + 8)], fill=color, width=line_width)
        draw.text((x + 50, cursor_y), text, font=font, fill=BLACK)
        cursor_y += 24


# Heatmap helpers
def viridis_color(value: float) -> tuple[int, int, int]:
    stops = [
        (0.0, np.array(ImageColor.getrgb("#440154"))),
        (0.25, np.array(ImageColor.getrgb("#3b528b"))),
        (0.5, np.array(ImageColor.getrgb("#21918c"))),
        (0.75, np.array(ImageColor.getrgb("#5ec962"))),
        (1.0, np.array(ImageColor.getrgb("#fde725"))),
    ]
    value = min(1.0, max(0.0, value))
    for (v0, c0), (v1, c1) in zip(stops[:-1], stops[1:]):
        if v0 <= value <= v1:
            t = (value - v0) / (v1 - v0)
            rgb = (1 - t) * c0 + t * c1
            return tuple(int(channel) for channel in rgb)
    return tuple(int(channel) for channel in stops[-1][1])


def paste_heatmap(image: Image.Image, region: PlotRegion, data: np.ndarray) -> None:
    height, width = data.shape
    heatmap = Image.new("RGB", (width, height), WHITE)
    pixels = heatmap.load()
    for row in range(height):
        for col in range(width):
            pixels[col, row] = viridis_color(float(data[row, col]))
    heatmap = heatmap.resize((region.width, region.height), Image.Resampling.BILINEAR)
    image.paste(heatmap, (region.left, region.top))


def draw_colorbar(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    *,
    left: int,
    top: int,
    height: int,
    width: int,
    font,
    title: str,
) -> None:
    bar = Image.new("RGB", (width, height), WHITE)
    pixels = bar.load()
    for row in range(height):
        value = 1.0 - row / max(1, height - 1)
        color = viridis_color(value)
        for col in range(width):
            pixels[col, row] = color
    image.paste(bar, (left, top))
    draw.rectangle([left, top, left + width, top + height], outline=BLACK, width=1)
    draw.text((left - 10, top - 32), title, font=font, fill=BLACK)
    draw.text((left + width + 8, top - 6), "1.0", font=font, fill=BLACK)
    draw.text((left + width + 8, top + height - 18), "0.0", font=font, fill=BLACK)


# Statistical helpers
def expected_wrong_repeat_keys(shots: np.ndarray, keyspace: int) -> np.ndarray:
    return shots * (shots - 1.0) / (2.0 * keyspace)


def expected_wrong_triples(shots: np.ndarray, keyspace: int) -> np.ndarray:
    return np.power(shots, 3) / (6.0 * keyspace * keyspace)


def probability_any_wrong_repeat(shots: np.ndarray, keyspace: int) -> np.ndarray:
    expected_pairs = expected_wrong_repeat_keys(shots, keyspace)
    return -np.expm1(-expected_pairs)


def probability_correct_repeat(mu: np.ndarray) -> np.ndarray:
    result = 1.0 - np.exp(-mu) * (1.0 + mu)
    small = mu < 1e-3
    if np.any(small):
        mu_small = mu[small]
        result[small] = 0.5 * mu_small * mu_small - (mu_small**3) / 3.0
    return np.clip(result, 0.0, 1.0)


def normal_cdf(value: float) -> float:
    return 0.5 * (1.0 + math.erf(value / math.sqrt(2.0)))


def recurring_dominance_probability_grid(
    lambda_true: np.ndarray,
    lambda_false: np.ndarray,
    multiplicity: int,
    *,
    recurring_min: int = 2,
    max_k: int | None = None,
) -> np.ndarray:
    lambda_true = np.asarray(lambda_true, dtype=float)
    lambda_false = np.asarray(lambda_false, dtype=float)
    max_lambda = float(max(np.max(lambda_true), np.max(lambda_false)))
    if max_k is None:
        max_k = int(math.ceil(max_lambda + 12.0 * math.sqrt(max_lambda + 1.0) + 18.0))

    pmf_true = np.exp(-lambda_true)
    pmf_false = np.exp(-lambda_false)
    cdf_false = pmf_false.copy()
    total = np.zeros_like(lambda_true)

    for k in range(1, max_k + 1):
        pmf_true = pmf_true * lambda_true / k
        if k >= recurring_min:
            total += pmf_true * np.power(cdf_false, multiplicity)
        pmf_false = pmf_false * lambda_false / k
        cdf_false = np.minimum(1.0, cdf_false + pmf_false)
    return np.clip(total, 0.0, 1.0)


def recurring_dominance_probability_scalar(
    lambda_true: float,
    lambda_false: float,
    multiplicity: int,
    *,
    recurring_min: int = 2,
) -> float:
    lambda_true = float(lambda_true)
    lambda_false = float(lambda_false)
    if lambda_true <= 0.0:
        return 0.0
    if lambda_false > 300.0 and lambda_false >= lambda_true:
        return 0.0
    if max(lambda_true, lambda_false) > 300.0:
        max_false_mean = lambda_false
        if multiplicity > 1:
            max_false_mean += math.sqrt(max(lambda_false, 1e-12)) * math.sqrt(2.0 * math.log(multiplicity))
        sigma = math.sqrt(max(lambda_true + lambda_false, 1.0))
        repeat_gate = normal_cdf((lambda_true - (recurring_min - 0.5)) / math.sqrt(max(lambda_true, 1.0)))
        dominance_gate = normal_cdf((lambda_true - max_false_mean) / sigma)
        return max(0.0, min(1.0, repeat_gate * dominance_gate))
    return float(
        recurring_dominance_probability_grid(
            np.array([[lambda_true]], dtype=float),
            np.array([[lambda_false]], dtype=float),
            multiplicity,
            recurring_min=recurring_min,
        )[0, 0]
    )


# Save and show a figure
def show_saved_png(path: Path, title: str) -> None:
    with Image.open(path) as image:
        array = np.asarray(image)
    fig, ax = plt.subplots(figsize=(max(8, array.shape[1] / 200), max(6, array.shape[0] / 200)))
    if hasattr(fig.canvas.manager, "set_window_title"):
        fig.canvas.manager.set_window_title(title)
    ax.imshow(array)
    ax.axis("off")
    plt.tight_layout()
    plt.show()


# Figure 1. Sample-and-Rank Recovery from Noisy ECDLP Ridge Outputs
def render_figure_1_sample_and_rank_recovery(output_dir: Path) -> Path:
    def add_box(ax, xy, width, height, text, fontsize=12):
        x, y = xy
        box = Rectangle(
            (x, y),
            width,
            height,
            linewidth=1.5,
            edgecolor="black",
            facecolor="white",
        )
        ax.add_patch(box)
        ax.text(
            x + width / 2,
            y + height / 2,
            text,
            ha="center",
            va="center",
            fontsize=fontsize,
            wrap=True,
        )
        return box

    def add_arrow(ax, start, end):
        arrow = FancyArrowPatch(
            start,
            end,
            arrowstyle="->",
            mutation_scale=18,
            linewidth=1.7,
            color="black",
        )
        ax.add_patch(arrow)

    fig = plt.figure(figsize=(12, 7))
    gs = GridSpec(2, 3, height_ratios=[1.0, 1.35], figure=fig)

    ax_flow = fig.add_subplot(gs[0, :])
    ax_hist = fig.add_subplot(gs[1, :])

    ax_flow.set_xlim(0, 12)
    ax_flow.set_ylim(0, 3)
    ax_flow.axis("off")

    add_box(ax_flow, (0.4, 0.85), 2.4, 1.15, "Measured\nFourier sample\n$(a,b)$", fontsize=12)
    add_box(
        ax_flow,
        (4.0, 0.85),
        3.3,
        1.15,
        r"Candidate key" "\n"
        r"$k_{\mathrm{cand}} = -a\,b^{-1}\ \mathrm{mod}\ n$" "\n"
        r"if $\gcd(b,n)=1$",
        fontsize=11,
    )
    add_box(ax_flow, (8.8, 0.85), 2.9, 1.15, "Candidate-key\nhistogram\nrank by recurrence", fontsize=12)

    add_arrow(ax_flow, (2.8, 1.42), (4.0, 1.42))
    add_arrow(ax_flow, (7.3, 1.42), (8.8, 1.42))

    ax_flow.text(
        6,
        2.65,
        "Sample-and-Rank Recovery from Noisy ECDLP Ridge Outputs",
        ha="center",
        va="center",
        fontsize=15,
        fontweight="bold",
    )

    ax_flow.text(
        6,
        0.25,
        r"The full $2^{256} \times 2^{256}$ landscape is not enumerated; each shot proposes one candidate key.",
        ha="center",
        va="center",
        fontsize=11,
    )

    rng = np.random.default_rng(7)
    num_candidates = 64
    x = np.arange(num_candidates)
    votes = rng.poisson(lam=1.2, size=num_candidates)
    correct_idx = 37
    votes[correct_idx] += 42
    votes[12] += 8
    votes[51] += 6
    votes[25] += 5

    ax_hist.bar(x, votes, width=0.85)
    ax_hist.scatter([correct_idx], [votes[correct_idx]], s=170, edgecolor="black", linewidth=1.3, zorder=5)
    ax_hist.annotate(
        "repeated\nridge votes",
        xy=(correct_idx, votes[correct_idx]),
        xytext=(correct_idx + 8, votes[correct_idx] - 5),
        arrowprops=dict(arrowstyle="->", linewidth=1.4),
        fontsize=11,
        ha="left",
        va="center",
    )

    ax_hist.text(
        0.02,
        0.91,
        r"Model idea: $D = rD_{\mathrm{ridge}} + (1-r)D_{\mathrm{noise}}$",
        transform=ax_hist.transAxes,
        fontsize=11,
        bbox=dict(
            boxstyle="round,pad=0.35",
            facecolor="white",
            edgecolor="black",
            alpha=0.88,
        ),
    )

    ax_hist.set_title("Illustrative Candidate-Key Recurrence", fontsize=14, fontweight="bold", pad=12)
    ax_hist.set_xlabel("Candidate key index / rank bucket", fontsize=12)
    ax_hist.set_ylabel("Vote count from measured samples", fontsize=12)
    ax_hist.grid(True, axis="y", linestyle="--", linewidth=0.5, alpha=0.4)

    plt.tight_layout()
    path = output_dir / "figure_1_sample_and_rank_recovery.png"
    fig.savefig(path, dpi=300, bbox_inches="tight")
    plt.show()
    return path


# Figure 2. Ridge Visibility Under a Depth-Error Contrast Model
def render_figure_2_ridge_visibility(output_dir: Path) -> Path:
    L_vals = np.logspace(4, 8, 500)
    eps_vals = np.logspace(-8, -4, 500)
    L_grid, eps_grid = np.meshgrid(L_vals, eps_vals)
    visibility = np.exp(-eps_grid * L_grid)

    points = {
        "A": {"epsilon": 1e-5, "L": 1e5},
        "B": {"epsilon": 1e-6, "L": 1e6},
        "C": {"epsilon": 5e-6, "L": 3e5},
    }

    fig, ax = plt.subplots(figsize=(10, 7))
    heat = ax.pcolormesh(L_grid, eps_grid, visibility, shading="auto")
    cbar = fig.colorbar(heat, ax=ax)
    cbar.set_label(r"Ridge visibility  $V = \exp(-\epsilon L)$", fontsize=12)

    contour_levels = [0.05, 0.1, 0.2, 0.5, 0.8]
    contours = ax.contour(L_grid, eps_grid, visibility, levels=contour_levels, linewidths=[1.0, 1.0, 2.4, 1.0, 1.0])
    ax.clabel(contours, inline=True, fontsize=10, fmt=r"$V = %.2f$")

    for name, point in points.items():
        ax.scatter(point["L"], point["epsilon"], s=160, edgecolor="black", linewidth=1.3, zorder=5)
        ax.text(point["L"] * 1.08, point["epsilon"] * 1.08, name, fontsize=14, fontweight="bold", zorder=6)

    legend_text = (
        "Operating points:\n"
        r"A: $\epsilon=10^{-5}$, $L=10^{5}$" "\n"
        r"B: $\epsilon=10^{-6}$, $L=10^{6}$" "\n"
        r"C: $\epsilon=5\times10^{-6}$, $L=3\times10^{5}$" "\n\n"
        "Visibility condition:\n"
        r"$\epsilon L \leq \ln(5) \approx 1.609$ for $V \geq 0.2$"
    )

    ax.text(
        0.03,
        0.04,
        legend_text,
        transform=ax.transAxes,
        fontsize=10,
        va="bottom",
        bbox=dict(boxstyle="round,pad=0.5", facecolor="white", edgecolor="black", alpha=0.88),
    )

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel(r"Coherent critical-path depth  $L$", fontsize=13)
    ax.set_ylabel(r"Effective error rate  $\epsilon$", fontsize=13)
    ax.set_title("Ridge Visibility Under a Depth–Error Contrast Model", fontsize=16, fontweight="bold")
    ax.grid(True, which="both", linestyle="--", linewidth=0.5, alpha=0.35)

    plt.tight_layout()
    path = output_dir / "figure_2_ridge_visibility.png"
    fig.savefig(path, dpi=300, bbox_inches="tight")
    plt.show()
    return path


# Figure 3. Signal Recurrence Versus Uniform-Noise Collisions
def render_figure_3_signal_vs_uniform_noise(output_dir: Path) -> Path:
    shots = np.logspace(5, 8, 240)
    ridge_fractions = [1e-8, 1e-7, 1e-6]
    correct_votes = [ridge * shots for ridge in ridge_fractions]
    wrong_repeat_expectation = expected_wrong_repeat_keys(shots, SECP256K1_ORDER)
    wrong_triple_expectation = expected_wrong_triples(shots, SECP256K1_ORDER)
    any_wrong_repeat = probability_any_wrong_repeat(shots, SECP256K1_ORDER)

    image = Image.new("RGB", (2000, 980), WHITE)
    draw = ImageDraw.Draw(image)
    title_font = load_font(34, bold=True)
    medium_font = load_font(24, bold=True)
    small_font = load_font(19)
    note_font = load_font(18)

    draw_centered_text(draw, (1000, 44), "Signal Recurrence vs Uniform-Noise Collisions", title_font)

    left_region = PlotRegion(120, 150, 930, 820, 1e5, 1e8, 1e-3, 1e2, x_scale="log", y_scale="log")
    right_region = PlotRegion(1080, 150, 1890, 820, 1e5, 1e8, 50, 140, x_scale="log", y_scale="linear")

    draw_axes(
        draw,
        left_region,
        title="Informative-Vote Scaling",
        x_ticks=[1e5, 1e6, 1e7, 1e8],
        y_ticks=[1e-3, 1e-2, 1e-1, 1, 10, 100],
        x_label="Shots S",
        y_label="Expected correct-key votes E[C_k] ~= rS",
        font_small=small_font,
        font_medium=medium_font,
        y_label_mode="vertical",
    )
    for y_ref, fill in [(1.0, BLACK), (2.0, GRAY)]:
        y = left_region.y_to_py(y_ref)
        draw.line([(left_region.left, y), (left_region.right, y)], fill=fill, width=2)
    for color, values in zip([BLUE, ORANGE, GREEN], correct_votes):
        draw_polyline(draw, left_region, shots, values, fill=color, width=4)
    draw.multiline_text(
        (left_region.left + 18, left_region.bottom - 108),
        "Upper-bound view:\nassumes each ridge-bearing shot\nmaps to the correct key.",
        font=note_font,
        fill=BLACK,
        spacing=4,
    )
    draw_legend(
        draw,
        [(BLUE, "r = 1e-8"), (ORANGE, "r = 1e-7"), (GREEN, "r = 1e-6")],
        x=left_region.right - 212,
        y=left_region.top + 18,
        font=small_font,
    )

    draw_axes(
        draw,
        right_region,
        title="Background Collision Suppression",
        x_ticks=[1e5, 1e6, 1e7, 1e8],
        y_ticks=[60, 80, 100, 120, 140],
        x_label="Shots S",
        y_label="-log10(collision risk), larger is safer",
        font_small=small_font,
        font_medium=medium_font,
        y_label_mode="vertical",
    )
    repeat_orders = -np.log10(np.maximum(wrong_repeat_expectation, 1e-320))
    triple_orders = -np.log10(np.maximum(wrong_triple_expectation, 1e-320))
    any_repeat_orders = -np.log10(np.maximum(any_wrong_repeat, 1e-320))
    draw_polyline(draw, right_region, shots, repeat_orders, fill=PURPLE, width=4)
    draw_polyline(draw, right_region, shots, triple_orders, fill=RED, width=4)
    draw_polyline(draw, right_region, shots, any_repeat_orders, fill=GRAY, width=3)
    draw.multiline_text(
        (right_region.left + 18, right_region.bottom - 84),
        "Even at 1e8 shots, the uniform-background\nwrong-repeat rate is suppressed by\nmore than 60 decimal orders.",
        font=note_font,
        fill=BLACK,
        spacing=4,
    )
    draw_legend(
        draw,
        [
            (PURPLE, "Wrong keys with count >= 2"),
            (RED, "Wrong keys with count >= 3"),
            (GRAY, "Probability of any wrong repeat"),
        ],
        x=right_region.left + 22,
        y=right_region.top + 18,
        font=small_font,
    )

    path = output_dir / "figure_3_signal_vs_uniform_noise.png"
    image.save(path)
    show_saved_png(path, "Figure 3")
    return path


# Figure 4. Sensitivity of Candidate Recurrence to r and S
def render_figure_4_rs_sensitivity(output_dir: Path) -> Path:
    shots = np.logspace(5, 8, 240)
    ridge_fraction = np.logspace(-9, -4, 220)
    s_grid, r_grid = np.meshgrid(shots, ridge_fraction)
    mu_correct = r_grid * s_grid
    p_correct_repeat = probability_correct_repeat(mu_correct)
    p_no_wrong_repeat = np.exp(-expected_wrong_repeat_keys(s_grid, SECP256K1_ORDER))
    unique_recurring_correct = p_correct_repeat * p_no_wrong_repeat

    image = Image.new("RGB", (1500, 1060), WHITE)
    draw = ImageDraw.Draw(image)
    title_font = load_font(34, bold=True)
    medium_font = load_font(24, bold=True)
    small_font = load_font(19)
    note_font = load_font(18)

    draw_centered_text(draw, (750, 44), "Sensitivity of Candidate Recurrence to r and S", title_font)
    region = PlotRegion(150, 150, 1180, 900, 1e5, 1e8, 1e-9, 1e-4, x_scale="log", y_scale="log")
    paste_heatmap(image, region, unique_recurring_correct)
    draw_axes(
        draw,
        region,
        title="Approximate probability that the correct key becomes the unique recurring candidate",
        x_ticks=[1e5, 1e6, 1e7, 1e8],
        y_ticks=[1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4],
        x_label="Shots S",
        y_label="Ridge fraction r",
        font_small=small_font,
        font_medium=medium_font,
        y_label_mode="vertical",
    )

    for const, color in zip([1.0, 3.0, 10.0, 30.0], [WHITE, (245, 245, 245), (230, 230, 230), (210, 210, 210)]):
        s_line = np.logspace(5, 8, 400)
        r_line = const / s_line
        valid = (r_line >= 1e-9) & (r_line <= 1e-4)
        if np.any(valid):
            draw_polyline(draw, region, s_line[valid], r_line[valid], fill=color, width=3)
            label_x = s_line[valid][len(s_line[valid]) // 2]
            label_y = r_line[valid][len(r_line[valid]) // 2]
            label = f"rS={const:g}"
            lx = region.x_to_px(float(label_x)) + 10
            ly = region.y_to_py(float(label_y)) - 12
            bbox = draw.textbbox((lx, ly), label, font=small_font)
            draw.rounded_rectangle([bbox[0] - 4, bbox[1] - 2, bbox[2] + 4, bbox[3] + 2], radius=5, fill=WHITE, outline=None)
            draw.text((lx, ly), label, font=small_font, fill=BLACK)

    draw.multiline_text(
        (region.left + 20, region.bottom - 84),
        "Uniform-background model with an optimistic\nridge-to-key mapping. The transition is driven\nmostly by the effective informative budget rS.",
        font=note_font,
        fill=BLACK,
        spacing=4,
    )
    draw_colorbar(image, draw, left=1240, top=170, height=680, width=36, font=small_font, title="Probability")

    path = output_dir / "figure_4_rs_sensitivity.png"
    image.save(path)
    show_saved_png(path, "Figure 4")
    return path


# Figure 5. Ridge Contamination Stress Test: Recurrence Under Imperfect Decoding
def render_figure_5_ridge_contamination(output_dir: Path) -> Path:
    shot_budgets = [10**6, 10**7, 10**8]
    ridge_fractions = np.logspace(-9, -6, 140)
    alpha_values = np.linspace(0.05, 1.0, 150)
    alias_count = 16
    panel_data: list[np.ndarray] = []

    for shots in shot_budgets:
        alpha_grid, r_grid = np.meshgrid(alpha_values, ridge_fractions)
        lambda_true = shots * r_grid * alpha_grid
        lambda_alias = shots * r_grid * (1.0 - alpha_grid) / alias_count
        probability = recurring_dominance_probability_grid(
            lambda_true,
            lambda_alias,
            alias_count,
            recurring_min=2,
        )
        panel_data.append(probability)

    image = Image.new("RGB", (2200, 980), WHITE)
    draw = ImageDraw.Draw(image)
    title_font = load_font(34, bold=True)
    medium_font = load_font(24, bold=True)
    small_font = load_font(18)
    note_font = load_font(17)

    draw_centered_text(draw, (1100, 42), "Ridge Contamination Stress Test: Recurrence Under Imperfect Decoding", title_font)

    regions = [
        PlotRegion(90, 170, 680, 790, 0.05, 1.0, 1e-9, 1e-6, x_scale="linear", y_scale="log"),
        PlotRegion(760, 170, 1350, 790, 0.05, 1.0, 1e-9, 1e-6, x_scale="linear", y_scale="log"),
        PlotRegion(1430, 170, 2020, 790, 0.05, 1.0, 1e-9, 1e-6, x_scale="linear", y_scale="log"),
    ]

    for region, shots, probability in zip(regions, shot_budgets, panel_data):
        paste_heatmap(image, region, probability)
        draw_axes(
            draw,
            region,
            title=f"S = {shots:.0e} shots",
            x_ticks=[0.1, 0.3, 0.5, 0.7, 0.9, 1.0],
            y_ticks=[1e-9, 1e-8, 1e-7, 1e-6],
            x_label="Ridge purity alpha",
            y_label="Ridge fraction r",
            font_small=small_font,
            font_medium=medium_font,
            x_label_offset=34,
            y_label_mode="vertical",
            y_label_x_offset=-78,
        )
        draw.multiline_text(
            (region.left + 18, region.bottom - 70),
            "Alias fanout A = 16.\nUniform background omitted here,\nso this isolates ridge impurity.",
            font=note_font,
            fill=BLACK,
            spacing=4,
        )

    draw_colorbar(image, draw, left=2070, top=200, height=560, width=36, font=small_font, title="Probability")

    path = output_dir / "figure_5_ridge_contamination.png"
    image.save(path)
    show_saved_png(path, "Figure 5")
    return path


# Figure A1. Clustered Wrong-Key Support Stress Test
def render_figure_a1_clustered_wrong_key_support(output_dir: Path) -> Path:
    shots = 10**8
    ridge_fractions = [1e-7, 3e-7, 1e-6]
    support_sizes = np.unique(np.round(np.logspace(4, 14, 90)).astype(int))
    curve_probabilities: list[np.ndarray] = []

    for ridge_fraction in ridge_fractions:
        lambda_true = shots * ridge_fraction
        probabilities = []
        for support_size in support_sizes:
            lambda_false = shots * (1.0 - ridge_fraction) / support_size
            probability = recurring_dominance_probability_scalar(
                lambda_true,
                lambda_false,
                int(support_size),
                recurring_min=2,
            )
            probabilities.append(probability)
        curve_probabilities.append(np.array(probabilities))

    image = Image.new("RGB", (1600, 980), WHITE)
    draw = ImageDraw.Draw(image)
    title_font = load_font(34, bold=True)
    medium_font = load_font(24, bold=True)
    small_font = load_font(19)
    note_font = load_font(18)

    draw_centered_text(draw, (800, 44), "Clustered Wrong-Key Support Stress Test", title_font)
    region = PlotRegion(130, 170, 1460, 740, 1e4, 1e14, 0.0, 1.0, x_scale="log", y_scale="linear")
    draw_axes(
        draw,
        region,
        title="Probability that the true key remains the unique recurring winner",
        x_ticks=[1e4, 1e6, 1e8, 1e10, 1e12, 1e14],
        y_ticks=[0.0, 0.25, 0.5, 0.75, 1.0],
        x_label="Effective wrong-key support size M",
        y_label="",
        font_small=small_font,
        font_medium=medium_font,
        x_label_offset=40,
    )

    y_label = "Dominance probability"
    y_bbox = draw.textbbox((0, 0), y_label, font=small_font)
    y_width = y_bbox[2] - y_bbox[0]
    y_height = y_bbox[3] - y_bbox[1]
    y_image = Image.new("RGBA", (y_width + 10, y_height + 10), (255, 255, 255, 0))
    y_draw = ImageDraw.Draw(y_image)
    y_draw.text((5, 5), y_label, font=small_font, fill=BLACK)
    y_rotated = y_image.rotate(90, expand=True)
    image.paste(y_rotated, (region.left - 112, region.top + region.height // 2 - y_rotated.height // 2), y_rotated)

    for color, ridge_fraction, probabilities in zip([BLUE, ORANGE, GREEN], ridge_fractions, curve_probabilities):
        draw_polyline(draw, region, support_sizes.astype(float), probabilities, fill=color, width=4)
        mean_crossover = (1.0 - ridge_fraction) / ridge_fraction
        x = region.x_to_px(mean_crossover)
        draw.line([(x, region.top), (x, region.bottom)], fill=color, width=2)

    draw_legend(
        draw,
        [(BLUE, "r = 1e-7"), (ORANGE, "r = 3e-7"), (GREEN, "r = 1e-6")],
        x=region.left + 30,
        y=region.top + 18,
        font=small_font,
    )
    draw.multiline_text(
        (region.left + 22, region.bottom + 62),
        "Adversarial model: all non-ridge mass is confined to M wrong keys.\n"
        "Colored vertical markers show the mean-crossover scale M ~= 1/r.\n"
        "Uniform 256-bit occupancy lies far off-scale to the right and is much safer.",
        font=note_font,
        fill=BLACK,
        spacing=4,
    )

    path = output_dir / "figure_A1_clustered_wrong_key_support.png"
    image.save(path)
    show_saved_png(path, "Figure A1")
    return path


# Figure A2. Order-32 Toy Logic vs Prime-Order Candidate Recovery
def render_figure_a2_order32_vs_prime_order(output_dir: Path) -> Path:
    shots = np.logspace(3, 8, 240)
    invertible_fraction_order32 = 16 / 32
    invertible_fraction_prime = 1.0 - 1.0 / SECP256K1_ORDER

    image = Image.new("RGB", (1800, 920), WHITE)
    draw = ImageDraw.Draw(image)
    title_font = load_font(34, bold=True)
    medium_font = load_font(24, bold=True)
    small_font = load_font(19)
    note_font = load_font(18)

    draw_centered_text(draw, (900, 44), "Order-32 Toy Logic vs Prime-Order Candidate Recovery", title_font)

    left_region = PlotRegion(150, 170, 820, 820, 0, 2, 0.0, 1.05)
    draw_axes(
        draw,
        left_region,
        title="Invertibility of the Recovery Coordinate",
        x_ticks=[],
        y_ticks=[0.0, 0.25, 0.5, 0.75, 1.0],
        x_label="",
        y_label="Usable fraction of measured b values",
        font_small=small_font,
        font_medium=medium_font,
        y_label_mode="vertical",
    )
    draw.rectangle([left_region.left + 1, left_region.bottom + 1, left_region.right - 1, left_region.bottom + 40], fill=WHITE)
    centers = [left_region.left + left_region.width * 0.32, left_region.left + left_region.width * 0.72]
    widths = 140
    bars = [
        (centers[0], invertible_fraction_order32, ORANGE, "Order 32\n(5-bit toy)"),
        (centers[1], invertible_fraction_prime, BLUE, "Prime order\n(secp256k1 logic)"),
    ]
    for center, fraction, color, label in bars:
        x0 = center - widths / 2
        x1 = center + widths / 2
        y1 = left_region.bottom
        y0 = left_region.y_to_py(fraction)
        draw.rectangle([x0, y0, x1, y1], fill=color, outline=BLACK)
        bbox = draw.multiline_textbbox((0, 0), label, font=small_font, spacing=4)
        draw.multiline_text(
            (center - (bbox[2] - bbox[0]) / 2, left_region.bottom + 24),
            label,
            font=small_font,
            fill=BLACK,
            spacing=4,
            align="center",
        )
        value_label = f"{fraction:.3f}" if fraction < 0.999999 else "1.000"
        draw.text((center - 24, y0 - 28), value_label, font=small_font, fill=BLACK)
    draw.multiline_text(
        (left_region.left + 22, left_region.bottom - 66),
        "Order-32: only odd b are invertible.\nPrime order: every nonzero b is invertible.",
        font=note_font,
        fill=BLACK,
        spacing=4,
    )

    right_region = PlotRegion(980, 170, 1670, 820, 1e3, 1e8, 5e2, 1e8, x_scale="log", y_scale="log")
    draw_axes(
        draw,
        right_region,
        title="Expected Usable Candidate Count",
        x_ticks=[1e3, 1e4, 1e5, 1e6, 1e7, 1e8],
        y_ticks=[1e3, 1e4, 1e5, 1e6, 1e7, 1e8],
        x_label="Shots S",
        y_label="Usable candidates after invertibility filter",
        font_small=small_font,
        font_medium=medium_font,
        y_label_mode="vertical",
    )
    draw_polyline(draw, right_region, shots, 0.5 * shots, fill=ORANGE, width=4)
    draw_polyline(draw, right_region, shots, shots, fill=BLUE, width=4)
    draw_legend(draw, [(ORANGE, "Order 32"), (BLUE, "Prime order")], x=right_region.left + 30, y=right_region.top + 18, font=small_font)
    draw.multiline_text(
        (right_region.left + 22, right_region.bottom - 66),
        "This only helps the post-processing filter.\nIt does not make the reversible oracle easier.",
        font=note_font,
        fill=BLACK,
        spacing=4,
    )

    path = output_dir / "figure_A2_order32_vs_prime_order.png"
    image.save(path)
    show_saved_png(path, "Figure A2")
    return path


# Main render sequence
def main() -> None:
    output_dir = ensure_output_dir()
    render_figure_1_sample_and_rank_recovery(output_dir)
    render_figure_2_ridge_visibility(output_dir)
    render_figure_3_signal_vs_uniform_noise(output_dir)
    render_figure_4_rs_sensitivity(output_dir)
    render_figure_5_ridge_contamination(output_dir)
    render_figure_a1_clustered_wrong_key_support(output_dir)
    render_figure_a2_order32_vs_prime_order(output_dir)


# Run the render sequence
if __name__ == "__main__":
    main()
