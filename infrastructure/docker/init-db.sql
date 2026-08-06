-- Inicialización del contenedor de PostgreSQL para desarrollo.
--
-- La base "shadow" la usa Prisma Migrate para detectar deriva de esquema
-- sin tocar la base de trabajo.
CREATE DATABASE casas_shadow OWNER casas;
