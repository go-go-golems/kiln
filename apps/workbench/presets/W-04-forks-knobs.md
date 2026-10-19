# Forks, knobs and sliders

Some rewrites are not always wins. A **fork** lets a rule offer several rewrites and leave the choice to a **decide policy**: pins, measurements, or a cost model. Here, `exp(t)` can stay a library call or become a Taylor polynomial of a chosen length, and the right answer differs per call site.

> **Try it** — open [Knobs](lab:view?name=knobs): two forks, each with every option scored. Then tighten the [tolerance to 1e-8](lab:param?name=tolerance&value=1e-8) and widen the [range to 4](lab:param?name=range&value=4), and watch the picks change. [Pin TERMS=4](lab:pin?TERMS=4) to force a choice, and read the check in [Code](lab:view?name=code). [Unpin](lab:unpin?name=TERMS).

## The maths

Truncating the Taylor series of $e^t$ after $n$ terms leaves the Lagrange remainder

$$\Big|e^t - \sum_{i=0}^{n} \frac{t^i}{i!}\Big| \;\le\; \frac{|t|^{n+1}}{(n+1)!}\, e^{|t|}$$

so on $|t| \le R$ the error bound is $\varepsilon(n, R) = R^{n+1} e^R / (n+1)!$. In Horner form the polynomial costs $2n$ operations: one multiply and one add per term.

The cost model (`cycles`) prices each option:

$$\text{cost}(n) = \begin{cases} 20 & n = 0 \text{ (keep } \exp) \\ 2n & \varepsilon(n, R_\text{node}) \le \text{tolerance} \\ \infty & \text{otherwise} \end{cases}$$

$R_\text{node}$ is the range *at that call site*. The program computes $e^x + 3e^{x/4}$, so the second call sees a quarter of the range: $R/4$.

With $R = 2$ and tolerance $10^{-6}$:

- `exp(x)` needs 14 terms (28 operations) to meet the bound, more than the 12 the fork offers and more than the call costs (20), so the fork keeps the call.
- `exp(x/4)` needs 8 terms (16 operations), which beats 20.

## The system

- `k.fork.over(TERMS, [3, 4, …], n => polynomial)` builds one option per value; `.keepOriginal()` adds "leave it alone" (`TERMS = 0`).
- The pipeline's decide policy is `chain(pinned, cycles, first)`: a pin wins, otherwise the cost model, otherwise the first option.
- A pinned knob narrows **every** fork that offers it. Per-node choices go through the kernel pins in [Knobs](lab:view?name=knobs).
- The knobs a pass offers are declared with `.knobs(TERMS)`. They appear in the Code view's parameters as *auto* until you pin them.

## Exercises

1. Add a range-reduction option: $e^t = (e^{t/2^k})^{2^k}$, which costs $k$ squarings but shrinks $R$. When does it win?
2. Replace the error bound by a measured error: evaluate each option on 64 points inside the cost function. What does that cost at compile time?
3. Pin `TERMS=4`. Compute the error bound at each call site first, then predict which checks fail and by how much.
