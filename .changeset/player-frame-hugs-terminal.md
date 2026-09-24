---
'@casoon/castwright-player': patch
---

The window frame hugs the terminal instead of stretching across a wide page. It used to
fill the container with the terminal centred inside, which left a wide empty band on
either side; it now caps its width at the terminal's own and still shrinks (and scales
the terminal) in a narrow container.
