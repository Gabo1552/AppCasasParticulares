-- Textos de términos y política de privacidad, versión 1.0.
--
-- Van en una migración y no en el seed porque el alta de cualquier perfil los
-- necesita: sin ellos no se puede registrar el consentimiento con la versión
-- exacta que la persona aceptó (SEG-04), y la aplicación devolvería un error en
-- un entorno recién migrado. El seed carga datos de demostración; esto es
-- contenido de producto que tiene que existir en todos los entornos.
--
-- Al publicar una versión nueva se agrega otra fila con `version` distinta: los
-- consentimientos ya otorgados siguen apuntando a la fila que la persona vio, y
-- por eso los textos nunca se editan en su lugar.

INSERT INTO "consent_document" ("id", "kind", "version", "locale", "body", "publishedAt", "createdAt")
VALUES (
  '00000000-0000-4000-8000-00000000c001',
  'TERMS_OF_SERVICE',
  '1.0',
  'es-AR',
  E'TÉRMINOS Y CONDICIONES DE USO — VERSIÓN 1.0\n\n'
  || E'1. Qué es esta plataforma\n\n'
  || E'Esta plataforma es una herramienta de gestión administrativa para relaciones '
  || E'laborales de personal de casas particulares. Sirve para organizar domicilios de '
  || E'trabajo, condiciones acordadas, horarios y documentación.\n\n'
  || E'2. Quién es el empleador\n\n'
  || E'La familia usuaria es, en todos los casos, la empleadora. La plataforma no emplea, '
  || E'no dirige ni sanciona al personal, y no interviene en la relación laboral. Las '
  || E'decisiones sobre la contratación, las tareas y su continuidad corresponden '
  || E'exclusivamente a las partes.\n\n'
  || E'3. La plataforma no maneja el salario\n\n'
  || E'El pago de la remuneración se realiza directamente de la familia a la persona '
  || E'trabajadora. La plataforma no recibe, no retiene y no administra fondos salariales '
  || E'en ningún momento.\n\n'
  || E'4. Trámites ante el organismo fiscal\n\n'
  || E'La plataforma no solicita ni almacena claves fiscales. Los comprobantes oficiales se '
  || E'generan en los sistemas del organismo correspondiente. La plataforma asiste con '
  || E'cálculos previos, recordatorios, validaciones y conciliación, pero no reemplaza los '
  || E'trámites oficiales ni el asesoramiento profesional.\n\n'
  || E'5. Cálculos de referencia\n\n'
  || E'Los importes y parámetros que muestre la plataforma tienen carácter orientativo '
  || E'hasta ser validados por un profesional. No constituyen una liquidación oficial.\n\n'
  || E'6. Uso responsable\n\n'
  || E'La persona usuaria se compromete a cargar información veraz y a no utilizar la '
  || E'plataforma para fines distintos de la administración de su propia relación laboral.\n\n'
  || E'7. Cambios en estos términos\n\n'
  || E'Si estos términos cambian, se publicará una versión nueva y se solicitará una nueva '
  || E'aceptación. La versión aceptada queda registrada junto con su fecha.',
  NOW(),
  NOW()
)
ON CONFLICT ("kind", "version", "locale") DO NOTHING;

INSERT INTO "consent_document" ("id", "kind", "version", "locale", "body", "publishedAt", "createdAt")
VALUES (
  '00000000-0000-4000-8000-00000000c002',
  'PRIVACY_POLICY',
  '1.0',
  'es-AR',
  E'POLÍTICA DE PRIVACIDAD — VERSIÓN 1.0\n\n'
  || E'1. Qué datos se piden\n\n'
  || E'En esta etapa se solicitan únicamente: nombre, apellido, correo electrónico, '
  || E'teléfono, zona horaria y los datos del domicilio donde se presta el trabajo.\n\n'
  || E'2. Qué datos NO se piden\n\n'
  || E'No se solicita clave fiscal. No se solicitan datos bancarios. No se solicita '
  || E'documentación de identidad. No se registra la ubicación geográfica.\n\n'
  || E'3. Para qué se usan\n\n'
  || E'Los datos se usan para administrar la relación laboral dentro de la plataforma: '
  || E'identificar a las partes, ubicar el domicilio de trabajo y organizar las '
  || E'condiciones y el horario acordados. No se usan con fines publicitarios ni se '
  || E'ceden a terceros con ese fin.\n\n'
  || E'4. Ingreso a la cuenta\n\n'
  || E'El ingreso se realiza mediante un código de un solo uso enviado por correo. La '
  || E'plataforma no almacena contraseñas ni los códigos en texto legible.\n\n'
  || E'5. Registro de actividad\n\n'
  || E'Las operaciones sensibles quedan registradas en un historial de auditoría que no '
  || E'puede modificarse ni borrarse. Ese registro no guarda códigos de acceso, tokens ni '
  || E'credenciales.\n\n'
  || E'6. Conservación y derechos\n\n'
  || E'Los datos se conservan mientras la relación laboral esté vigente y durante los '
  || E'plazos que exija la normativa aplicable. La persona titular puede solicitar acceso, '
  || E'rectificación y supresión de sus datos personales.\n\n'
  || E'7. Cambios en esta política\n\n'
  || E'Si esta política cambia, se publicará una versión nueva y se solicitará una nueva '
  || E'aceptación. La versión aceptada queda registrada junto con su fecha.',
  NOW(),
  NOW()
)
ON CONFLICT ("kind", "version", "locale") DO NOTHING;
