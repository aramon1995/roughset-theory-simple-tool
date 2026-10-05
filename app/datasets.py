"""Small, standard datasets embedded as CSV text for quick POC validation
of the rough-set analysis, selectable from the UI without needing to
upload a file first.

- ``pawlak_flu``: the textbook patient/flu decision table used in most
  introductions to rough set theory (Pawlak 1991). All-categorical,
  tiny (8 rows) -- ideal to sanity check lower/upper approximations by
  hand.
- ``play_tennis``: the classic "Play Tennis" / weather decision table
  (Quinlan-style, 14 rows, all categorical) widely reused in rough-set
  and rule-induction literature.
- ``iris``: a small, class-balanced sample of the UCI Iris flower dataset
  (45 rows, 15 per species; 4 numeric condition attributes + species
  decision). Included to demonstrate discretization of continuous
  attributes prior to computing the indiscernibility relation.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import pandas as pd

_PAWLAK_FLU_CSV = """\
Patient,Headache,Muscle_pain,Temperature,Flu
p1,yes,yes,normal,no
p2,yes,yes,high,yes
p3,yes,yes,very_high,yes
p4,no,yes,normal,no
p5,no,no,high,no
p6,no,yes,very_high,yes
p7,no,yes,high,yes
p8,no,no,very_high,no
"""

_PLAY_TENNIS_CSV = """\
Day,Outlook,Temperature,Humidity,Wind,PlayTennis
d1,sunny,hot,high,weak,no
d2,sunny,hot,high,strong,no
d3,overcast,hot,high,weak,yes
d4,rain,mild,high,weak,yes
d5,rain,cool,normal,weak,yes
d6,rain,cool,normal,strong,no
d7,overcast,cool,normal,strong,yes
d8,sunny,mild,high,weak,no
d9,sunny,cool,normal,weak,yes
d10,rain,mild,normal,weak,yes
d11,sunny,mild,normal,strong,yes
d12,overcast,mild,high,strong,yes
d13,overcast,hot,normal,weak,yes
d14,rain,mild,high,strong,no
"""

_IRIS_CSV = """\
sepal_length,sepal_width,petal_length,petal_width,species
5.1,3.5,1.4,0.2,setosa
4.9,3.0,1.4,0.2,setosa
4.7,3.2,1.3,0.2,setosa
4.6,3.1,1.5,0.2,setosa
5.0,3.6,1.4,0.2,setosa
5.4,3.9,1.7,0.4,setosa
4.6,3.4,1.4,0.3,setosa
5.0,3.4,1.5,0.2,setosa
4.4,2.9,1.4,0.2,setosa
4.9,3.1,1.5,0.1,setosa
5.4,3.7,1.5,0.2,setosa
4.8,3.4,1.6,0.2,setosa
4.8,3.0,1.4,0.1,setosa
4.3,3.0,1.1,0.1,setosa
5.8,4.0,1.2,0.2,setosa
7.0,3.2,4.7,1.4,versicolor
6.4,3.2,4.5,1.5,versicolor
6.9,3.1,4.9,1.5,versicolor
5.5,2.3,4.0,1.3,versicolor
6.5,2.8,4.6,1.5,versicolor
5.7,2.8,4.5,1.3,versicolor
6.3,3.3,4.7,1.6,versicolor
4.9,2.4,3.3,1.0,versicolor
6.6,2.9,4.6,1.3,versicolor
5.2,2.7,3.9,1.4,versicolor
5.0,2.0,3.5,1.0,versicolor
5.9,3.0,4.2,1.5,versicolor
6.0,2.2,4.0,1.0,versicolor
6.1,2.9,4.7,1.4,versicolor
5.6,2.9,3.6,1.3,versicolor
6.3,3.3,6.0,2.5,virginica
5.8,2.7,5.1,1.9,virginica
7.1,3.0,5.9,2.1,virginica
6.3,2.9,5.6,1.8,virginica
6.5,3.0,5.8,2.2,virginica
7.6,3.0,6.6,2.1,virginica
4.9,2.5,4.5,1.7,virginica
7.3,2.9,6.3,1.8,virginica
6.7,2.5,5.8,1.8,virginica
7.2,3.6,6.1,2.5,virginica
6.5,3.2,5.1,2.0,virginica
6.4,2.7,5.3,1.9,virginica
6.8,3.0,5.5,2.1,virginica
5.7,2.5,5.0,2.0,virginica
5.8,2.8,5.1,2.4,virginica
"""


@dataclass
class SampleDataset:
    key: str
    name: str
    description: str
    csv_text: str
    decision_attribute: str
    suggested_bins: int = 4


SAMPLE_DATASETS: dict[str, SampleDataset] = {
    "pawlak_flu": SampleDataset(
        key="pawlak_flu",
        name="Pawlak Flu (patients)",
        description=(
            "Ejemplo clasico de Pawlak (1991): 8 pacientes descritos por "
            "Headache/Muscle_pain/Temperature, con decision Flu. Todo "
            "categorico, ideal para verificar aproximaciones a mano."
        ),
        csv_text=_PAWLAK_FLU_CSV,
        decision_attribute="Flu",
    ),
    "play_tennis": SampleDataset(
        key="play_tennis",
        name="Play Tennis (weather)",
        description=(
            "Tabla de decision meteorologica clasica (14 dias): "
            "Outlook/Temperature/Humidity/Wind -> PlayTennis. Categorico."
        ),
        csv_text=_PLAY_TENNIS_CSV,
        decision_attribute="PlayTennis",
    ),
    "iris": SampleDataset(
        key="iris",
        name="Iris (UCI, muestra balanceada)",
        description=(
            "Submuestra balanceada del dataset UCI Iris (45 flores, 15 por "
            "especie, 4 atributos numericos + especie). Requiere "
            "discretizacion de los atributos numericos antes de construir "
            "la relacion de indiscernibilidad."
        ),
        csv_text=_IRIS_CSV,
        decision_attribute="species",
        suggested_bins=3,
    ),
}


def list_datasets() -> list[dict]:
    return [
        {
            "key": ds.key,
            "name": ds.name,
            "description": ds.description,
            "decision_attribute": ds.decision_attribute,
            "suggested_bins": ds.suggested_bins,
        }
        for ds in SAMPLE_DATASETS.values()
    ]


def get_dataset(key: str) -> SampleDataset:
    if key not in SAMPLE_DATASETS:
        raise KeyError(f"Unknown sample dataset: {key}")
    return SAMPLE_DATASETS[key]


def read_csv_text(csv_text: str) -> pd.DataFrame:
    return pd.read_csv(io.StringIO(csv_text))
