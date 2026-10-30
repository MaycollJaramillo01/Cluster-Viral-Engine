# Instrucciones para ingenieros/agentes de implementación

1. Leer `source/requerimientos_originales.txt` y documentar cualquier diferencia entre requerido y propuesto.
2. Iniciar en FASE-00. No implementar dashboard o publicación antes de verificar Meta formato y PoC multimedia.
3. Si una API no está disponible, construir mock pero etiquetar `BLOCKED_EXTERNAL`; nunca declarar verificado.
4. Mantener Vercel y Neon como anclas de arquitectura. FFmpeg puede correr fuera si benchmarks lo exigen.
5. Nunca crear endpoint de publicación que reciba `approved=true` como suficiente. Confirmar render hash, licencias, claims, actor y roles mediante DB transaction.
6. No colocar secrets en frontend ni en git. Neon credentials se manejan por entorno.
7. Usar org scope y RLS; escribir tests cross-org antes del CRUD público.
8. Entregables por PR: diseño, archivos, tests, rollback, coste y evidencia.
9. Seguir el prompt detallado al final de cada `phases/FASE-xx-*.md`.
10. No presentar este starter como sistema completamente desarrollado.
