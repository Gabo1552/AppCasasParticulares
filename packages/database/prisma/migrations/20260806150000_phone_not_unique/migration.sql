-- El teléfono deja de ser único.
--
-- Es un dato de contacto, no un identificador: dos integrantes de la misma
-- familia pueden declarar el mismo número, y con el índice único la segunda alta
-- fallaba. Además, un único observable permite enumerar teléfonos registrados
-- probando altas y mirando cuáles chocan.
--
-- El ingreso sigue siendo por correo, que sí es único.

DROP INDEX IF EXISTS "user_phone_key";
