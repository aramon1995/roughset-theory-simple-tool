"""Rough Set Theory (Pawlak) core algorithms.

Pure, dependency-light implementation of the classical rough set framework:

- Information system: universe U of objects described by attributes A.
- Indiscernibility relation IND(P): two objects are P-indiscernible if they
  share identical values for every attribute in P subset A. IND(P) is an
  equivalence relation; U/IND(P) is the partition of U into equivalence
  classes [x]_P.
- For a target set (decision class) X subset U:
    - P-lower approximation:  P_(X) = { x : [x]_P subset X }
      (a.k.a. positive region of X) -- objects that CERTAINLY belong to X.
    - P-upper approximation:  P^(X) = { x : [x]_P intersect X != empty }
      -- objects that POSSIBLY belong to X.
    - Boundary region: BN_P(X) = P^(X) - P_(X) -- objects that can neither
      be confirmed nor excluded.
    - Accuracy of approximation: alpha_P(X) = |P_(X)| / |P^(X)|  (in [0, 1]).
- Quality of classification: fraction of the whole universe that falls into
  the positive region of *some* decision class, i.e. gamma = |POS| / |U|.

Reference: Pawlak, Z. (1991) "Rough Sets: Theoretical Aspects of Reasoning
About Data"; and the summary at https://en.wikipedia.org/wiki/Rough_set

No ML/complex dependencies are required for this module; only the Python
standard library plus a light dependency on ``pandas`` for CSV/tabular
ingestion at the call site.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from itertools import combinations
from typing import Any, Hashable

import pandas as pd

# A row index in the universe U is represented as a plain int (0-based
# position in the input table).
ObjectId = int


def build_equivalence_classes(
    rows: list[tuple[Hashable, ...]],
) -> dict[tuple[Hashable, ...], list[ObjectId]]:
    """Partition the universe U/IND(P) given the attribute-value tuple for
    each object (already restricted/discretized to the attribute subset P).

    Args:
        rows: for each object (in universe order), the tuple of its values
            over the attribute subset P used to compute indiscernibility.

    Returns:
        Mapping from the discriminating value-tuple ("signature") to the
        list of object ids sharing that signature -- i.e. the equivalence
        classes of IND(P).
    """
    classes: dict[tuple[Hashable, ...], list[ObjectId]] = defaultdict(list)
    for obj_id, signature in enumerate(rows):
        classes[signature].append(obj_id)
    return dict(classes)


def decision_classes(
    decision_values: list[Hashable],
) -> dict[Hashable, set[ObjectId]]:
    """Group object ids by decision attribute value: X_v = {x : d(x) = v}."""
    classes: dict[Hashable, set[ObjectId]] = defaultdict(set)
    for obj_id, value in enumerate(decision_values):
        classes[value].add(obj_id)
    return dict(classes)


def lower_approximation(
    equivalence_classes: dict[Any, list[ObjectId]], target: set[ObjectId]
) -> set[ObjectId]:
    """P_(X) = union of equivalence classes fully contained in X."""
    result: set[ObjectId] = set()
    for members in equivalence_classes.values():
        member_set = set(members)
        if member_set <= target:
            result |= member_set
    return result


def upper_approximation(
    equivalence_classes: dict[Any, list[ObjectId]], target: set[ObjectId]
) -> set[ObjectId]:
    """P^(X) = union of equivalence classes intersecting X."""
    result: set[ObjectId] = set()
    for members in equivalence_classes.values():
        member_set = set(members)
        if member_set & target:
            result |= member_set
    return result


def approximation_accuracy(lower: set[ObjectId], upper: set[ObjectId]) -> float:
    """alpha_P(X) = |P_(X)| / |P^(X)|. Defined as 1.0 when X is empty
    (upper approximation empty => nothing to approximate, perfect by
    convention), matching the classical definition's boundary case.
    """
    if not upper:
        return 1.0
    return len(lower) / len(upper)


@dataclass
class ClassApproximation:
    """Rough-set approximation of a single decision class X_v."""

    value: Any
    size: int
    objects: list[ObjectId]
    lower_approximation: list[ObjectId]
    upper_approximation: list[ObjectId]
    boundary: list[ObjectId]
    accuracy: float


@dataclass
class RoughSetResult:
    universe_size: int
    condition_attributes: list[str]
    decision_attribute: str
    discretization: dict[str, int | None]
    equivalence_class_count: int
    equivalence_classes: list[dict[str, Any]]
    classes: list[ClassApproximation]
    positive_region: list[ObjectId] = field(default_factory=list)
    quality_of_classification: float = 0.0
    condition_values: list[tuple[Any, ...]] = field(default_factory=list)


def discretize_series(series: pd.Series, bins: int) -> pd.Series:
    """Discretize a numeric column into `bins` equal-width intervals so it
    can participate meaningfully in an indiscernibility relation (otherwise
    every numeric value would form its own singleton equivalence class).

    Non-numeric columns, or numeric columns with few distinct values
    (<= bins), are returned unchanged (as strings) since they are already
    coarse enough to be treated as nominal attributes.
    """
    if not pd.api.types.is_numeric_dtype(series):
        return series.astype(str)

    n_unique = series.nunique(dropna=True)
    if n_unique <= bins:
        return series.astype(str)

    try:
        binned = pd.cut(series, bins=bins, duplicates="drop")
    except ValueError:
        return series.astype(str)
    return binned.astype(str)


def analyze(
    df: pd.DataFrame,
    condition_attributes: list[str],
    decision_attribute: str,
    bins: int = 4,
) -> RoughSetResult:
    """Run the full classical rough-set analysis of a decision system
    (U, C, D) where C = condition_attributes and D = {decision_attribute}.

    Steps:
      1. Discretize numeric condition columns (equal-width binning) so
         IND(C) is a meaningful, non-trivial equivalence relation.
      2. Compute U/IND(C), the equivalence classes over condition attrs.
      3. Compute the decision classes X_v = {x : d(x) = v}.
      4. For every decision class, compute its C-lower and C-upper
         approximation, boundary region and accuracy alpha_C(X_v).
      5. Compute the overall quality of classification
         gamma_C(D) = |POS_C(D)| / |U|, where POS_C(D) is the union of the
         lower approximations of all decision classes.
    """
    if decision_attribute in condition_attributes:
        raise ValueError("decision_attribute must not be one of condition_attributes")
    if not condition_attributes:
        raise ValueError("at least one condition attribute is required")

    universe_size = len(df)

    discretization: dict[str, int | None] = {}
    prepared_cols: dict[str, pd.Series] = {}
    for col in condition_attributes:
        series = df[col]
        if pd.api.types.is_numeric_dtype(series) and series.nunique(dropna=True) > bins:
            prepared_cols[col] = discretize_series(series, bins)
            discretization[col] = bins
        else:
            prepared_cols[col] = series.astype(str)
            discretization[col] = None

    condition_rows = list(
        zip(*(prepared_cols[col].tolist() for col in condition_attributes))
    )
    equiv_classes = build_equivalence_classes(condition_rows)

    decision_values = df[decision_attribute].astype(str).tolist()
    dec_classes = decision_classes(decision_values)

    class_results: list[ClassApproximation] = []
    positive_region: set[ObjectId] = set()

    for value, target in sorted(dec_classes.items(), key=lambda kv: str(kv[0])):
        lower = lower_approximation(equiv_classes, target)
        upper = upper_approximation(equiv_classes, target)
        boundary = upper - lower
        accuracy = approximation_accuracy(lower, upper)
        positive_region |= lower

        class_results.append(
            ClassApproximation(
                value=value,
                size=len(target),
                objects=sorted(target),
                lower_approximation=sorted(lower),
                upper_approximation=sorted(upper),
                boundary=sorted(boundary),
                accuracy=round(accuracy, 4),
            )
        )

    quality = len(positive_region) / universe_size if universe_size else 0.0

    equiv_classes_out = [
        {"signature": list(sig), "objects": sorted(members)}
        for sig, members in sorted(
            equiv_classes.items(), key=lambda kv: kv[1][0]
        )
    ]

    return RoughSetResult(
        universe_size=universe_size,
        condition_attributes=condition_attributes,
        decision_attribute=decision_attribute,
        discretization=discretization,
        equivalence_class_count=len(equiv_classes),
        equivalence_classes=equiv_classes_out,
        classes=class_results,
        positive_region=sorted(positive_region),
        quality_of_classification=round(quality, 4),
        condition_values=condition_rows,
    )


def compute_class_overlap(classes: list[ClassApproximation]) -> dict[str, Any]:
    """Group objects by the exact combination of decision-class *upper*
    approximations they belong to -- the data needed to draw a Venn/Euler
    diagram or an UpSet plot of how decision classes overlap.

    Theoretical note: since the decision attribute assigns exactly one
    value per object, the raw decision classes X_v (and, as a consequence,
    their lower approximations) always form a disjoint partition of U --
    there is nothing to intersect there. The only place genuine overlap
    can occur is between *upper* approximations: an object x belongs to
    C^(X_v) for every decision value v that appears among the members of
    its equivalence class [x]_C. So:

      - a membership signature of size 1 (x belongs to the upper
        approximation of exactly one class) means x is in that class's
        *lower* approximation (positive region) -- a "certain" object.
      - a membership signature of size >= 2 means x sits in the shared
        *boundary* of those classes -- an object that is indiscernible,
        via C, from objects of a different decision value.

    Returns a dict with ``class_values`` (decision values in a fixed
    order, used to lay out Venn circles / UpSet columns) and ``regions``:
    one entry per non-empty combination of decision values that actually
    occurs, each with its object count and object id list, sorted by
    descending count.
    """
    membership: dict[ObjectId, set[Any]] = defaultdict(set)
    for cls in classes:
        for obj_id in cls.upper_approximation:
            membership[obj_id].add(cls.value)

    regions: dict[frozenset, list[ObjectId]] = defaultdict(list)
    for obj_id, values in membership.items():
        regions[frozenset(values)].append(obj_id)

    return {
        "class_values": [cls.value for cls in classes],
        "regions": [
            {
                "combo": sorted(combo, key=str),
                "count": len(objs),
                "objects": sorted(objs),
            }
            for combo, objs in sorted(
                regions.items(), key=lambda kv: (-len(kv[1]), sorted(kv[0], key=str))
            )
        ],
    }


def compute_rough_membership(
    equivalence_classes: list[dict[str, Any]],
    decision_values: list[Any],
    class_values: list[Any],
) -> dict[ObjectId, dict[Any, dict[str, float]]]:
    """Rough membership function: mu_X(x) = |[x]_C intersect X| / |[x]_C|,
    computed for every object x and every decision class X = X_v.

    This generalizes the discrete lower/boundary/negative regions into a
    continuous degree: mu_v(x) == 1.0 iff x is in the lower approximation
    of X_v (certain membership); mu_v(x) == 0.0 iff x's equivalence class
    never touches X_v; any value strictly between 0 and 1 means x sits in
    the boundary of X_v, with the exact fraction telling you *how*
    ambiguous that particular object is (not just that it is ambiguous).

    Returns a mapping from object id to a dict of decision value -> a
    small record {"score", "count", "size"} (count/size is exactly the
    score, kept separately so the UI can show the raw fraction).
    """
    membership: dict[ObjectId, dict[Any, dict[str, float]]] = {}
    for eq in equivalence_classes:
        members = eq["objects"]
        size = len(members)
        counts: dict[Any, int] = defaultdict(int)
        for obj_id in members:
            counts[decision_values[obj_id]] += 1
        class_membership = {
            v: {
                "score": round(counts.get(v, 0) / size, 4),
                "count": counts.get(v, 0),
                "size": size,
            }
            for v in class_values
        }
        for obj_id in members:
            membership[obj_id] = class_membership
    return membership


def compute_discernibility(
    condition_values: list[tuple[Any, ...]],
    condition_attributes: list[str],
    decision_values: list[Any],
    max_universe: int = 60,
) -> dict[str, Any]:
    """Decision-relative discernibility matrix: for every pair of objects
    with DIFFERENT decision values, list which condition attributes
    distinguish them (differ in value).

    A pair with an EMPTY discerning set is the key rough-set phenomenon:
    two objects that are C-indiscernible (same equivalence class) yet
    carry different decisions can never be separated by C -- that is
    exactly why they fall into the boundary region of both their decision
    classes. An attribute that is the *sole* discerner of some pair is
    indispensable: removing it would make that pair indiscernible, so it
    belongs to every reduct (it is a "core" attribute).

    This is an O(n^2) computation, so it is capped at ``max_universe``
    objects to keep requests on arbitrary user-uploaded CSVs bounded;
    above that it reports itself as unavailable instead of computing.
    """
    n = len(condition_values)
    if n > max_universe:
        return {
            "available": False,
            "universe_size": n,
            "limit": max_universe,
            "pairs": [],
            "core_attributes": [],
            "discerner_counts": {},
        }

    pairs = []
    discerner_counts: dict[str, int] = {attr: 0 for attr in condition_attributes}
    core_attributes: set[str] = set()
    for i in range(n):
        for j in range(i + 1, n):
            if decision_values[i] == decision_values[j]:
                continue
            discerning = [
                attr
                for attr, vi, vj in zip(
                    condition_attributes, condition_values[i], condition_values[j]
                )
                if vi != vj
            ]
            pairs.append({"i": i, "j": j, "attributes": discerning})
            for attr in discerning:
                discerner_counts[attr] += 1
            if len(discerning) == 1:
                core_attributes.add(discerning[0])

    return {
        "available": True,
        "universe_size": n,
        "pairs": pairs,
        "discerner_counts": discerner_counts,
        "core_attributes": sorted(core_attributes),
    }


def explore_reducts(
    df: pd.DataFrame,
    condition_attributes: list[str],
    decision_attribute: str,
    bins: int = 4,
    max_full_enum: int = 8,
) -> dict[str, Any]:
    """Explore how the quality of classification gamma_C(D) changes across
    subsets of the condition attributes, to spot candidate reducts:
    minimal attribute subsets that preserve the same classification
    quality as the full attribute set.

    Enumerates every non-empty subset when there are few enough attributes
    (<= max_full_enum, i.e. up to 2**n - 1 subsets, still cheap since each
    subset only costs one more equivalence-class pass over a small table).
    Otherwise falls back to just the full set plus every "leave one out"
    subset, to keep the computation bounded for wide datasets.
    """
    attrs = list(condition_attributes)
    n = len(attrs)
    if n == 0:
        return {"full_enumeration": True, "results": []}

    if n <= max_full_enum:
        subsets = [
            list(combo) for r in range(1, n + 1) for combo in combinations(attrs, r)
        ]
        full_enumeration = True
    else:
        subsets = [attrs] + [[a for a in attrs if a != dropped] for dropped in attrs]
        full_enumeration = False

    results = []
    for combo in subsets:
        result = analyze(df, combo, decision_attribute, bins=bins)
        results.append(
            {
                "attributes": combo,
                "size": len(combo),
                "quality": result.quality_of_classification,
            }
        )

    results.sort(key=lambda r: (-r["quality"], r["size"]))
    return {"full_enumeration": full_enumeration, "results": results}

