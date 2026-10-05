# Rough Set Theory — POC

Proof of concept que, dado un dataset tabular (CSV), construye la
**aproximacion inferior y superior de cada clase de decision** siguiendo la
teoria clasica de conjuntos aproximados de Pawlak (1991).

## Fundamento teorico

Dado un sistema de decision $(U, C, D)$ donde $U$ es el universo de objetos,
$C$ los atributos de condicion y $D$ el atributo de decision:

- **Relacion de indiscernibilidad** $IND(C)$: dos objetos son indiscernibles
  si comparten los mismos valores para todos los atributos en $C$. Esto
  particiona $U$ en clases de equivalencia $U/IND(C)$.
- Para cada clase de decision $X_v = \{x : d(x) = v\}$:
  - **Aproximacion inferior** (region positiva):
    $\underline{C}(X) = \{x : [x]_C \subseteq X\}$ — objetos que
    pertenecen a $X$ con certeza.
  - **Aproximacion superior**: $\overline{C}(X) = \{x : [x]_C \cap X \neq \emptyset\}$
    — objetos que posiblemente pertenecen a $X$.
  - **Frontera**: $BN_C(X) = \overline{C}(X) - \underline{C}(X)$ — objetos
    ambiguos.
  - **Exactitud**: $\alpha_C(X) = |\underline{C}(X)| / |\overline{C}(X)|$.
- **Calidad de clasificacion**: $\gamma_C(D) = |POS_C(D)| / |U|$, donde
  $POS_C(D)$ es la union de las aproximaciones inferiores de todas las
  clases de decision.

Referencia: Pawlak, Z. (1991) *Rough Sets: Theoretical Aspects of Reasoning
About Data*; resumen en [Wikipedia — Rough set](https://en.wikipedia.org/wiki/Rough_set).

Los atributos numericos con muchos valores distintos se discretizan
(bins de igual ancho) antes de construir $IND(C)$, ya que de otro modo cada
valor formaria su propia clase de equivalencia trivial.

### Solapamiento entre clases (Venn / UpSet)

Las clases de decision $X_v$ particionan $U$ (cada objeto tiene un unico
valor de decision), y por construccion **sus aproximaciones inferiores
tambien son siempre disjuntas** entre si. Lo unico que puede solaparse es
la **aproximacion superior**: un objeto $x$ pertenece a $\overline{C}(X_v)$
por cada valor $v$ presente en su clase de equivalencia $[x]_C$. Por eso el
diagrama de solapamiento (seccion 4 de la UI) agrupa los objetos segun la
combinacion exacta de aproximaciones superiores a las que pertenecen:

- combinaciones de tamano 1 = region positiva (certeza) de esa clase.
- combinaciones de tamano $\geq 2$ = frontera compartida entre esas clases
  (objetos indiscernibles con decisiones distintas).

Con 2 o 3 clases de decision se dibuja un diagrama de Venn/Euler
interactivo (SVG); con 4 o mas clases se cambia automaticamente a una
vista tipo **UpSet plot** (matriz de combinaciones + barras), ya que los
circulos dejan de ser legibles a partir de 4 conjuntos. Ambas vistas
permiten hacer click en una region/fila para ver la lista exacta de
objetos involucrados.

## Estructura del proyecto

```
app/
  rough_sets.py   # algoritmos puros (equivalencia, aprox. inferior/superior, exactitud, solapamiento)
  datasets.py     # datasets de ejemplo embebidos (CSV) para pruebas rapidas
  main.py         # API FastAPI + servido de la UI estatica
static/
  index.html, style.css, script.js  # capa de visualizacion (sin frameworks)
```

## Datasets de ejemplo incluidos

- **Pawlak Flu**: 8 pacientes, ejemplo textual clasico para verificar
  aproximaciones a mano (categorico).
- **Play Tennis**: tabla de decision meteorologica de 14 dias (categorico).
- **Iris (muestra balanceada)**: 45 flores (15 por especie), 4 atributos
  numericos — para probar la discretizacion.

## Ejecucion (entorno uv)

El entorno virtual (`.venv`) y las dependencias ya estan gestionadas con
[uv](https://docs.astral.sh/uv/).

```bash
uv run uvicorn app.main:app --reload --port 8000
```

Abrir [http://127.0.0.1:8000](http://127.0.0.1:8000) en el navegador.

Desde la UI:

1. Elegir un dataset de ejemplo o subir un CSV propio.
2. Seleccionar el atributo de decision (D) y los atributos de condicion (C).
   Las columnas tipo identificador (valores unicos por fila) se detectan y
   se dejan desmarcadas por defecto.
3. Ajustar el numero de bins para discretizar columnas numericas si aplica.
4. Pulsar "Analizar" para calcular las aproximaciones y visualizar el mapa
   de regiones (inferior / frontera / negativa) por objeto.
