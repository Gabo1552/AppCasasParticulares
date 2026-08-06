
[TABLA 1]
| DOCUMENTO DE REQUERIMIENTOS / Plataforma de gestión de personal de casas particulares y niñeras / Producto, operación, software, ARCA, contadores, fichaje, liquidación y pagos |


[TABLA 2]
| Versión | 1.0 |
| Fecha | 5 de agosto de 2026 |
| Ámbito inicial | Argentina - lanzamiento recomendado en Córdoba |
| Estado | Especificación base para estimación, diseño y desarrollo |
| Preparado para | Gabo |

Documento funcional y técnico. No reemplaza el dictamen de un abogado laboral, especialista en privacidad o contador matriculado.

# Control del documento

[TABLA 3]
| Campo | Detalle |
| Objetivo | Definir qué debe construir el equipo de producto, diseño, desarrollo, operaciones y cumplimiento. |
| Audiencia | Fundadores, product manager, diseñadores, desarrolladores, QA, operaciones, contadores y asesores legales. |
| Método de priorización | MoSCoW: Debe / Debería / Podría. |
| Fuera de alcance legal | El documento no confirma que el servicio “Personal de Casas Particulares” sea delegable ni que exista una API pública específica; ambos puntos requieren validación formal con ARCA. |


[TABLA 4]
| Decisión de producto recomendada / La primera versión debe administrar relaciones laborales existentes. El marketplace de búsqueda se incorpora después de validar fichaje, liquidación, administración contable y disposición a pagar. |


# Contenido

[TABLA 5]
| Sección | Contenido |
| 1 | Resumen ejecutivo |
| 2 | Visión, objetivos y métricas |
| 3 | Alcance del producto |
| 4 | Usuarios y responsabilidades |
| 5 | Principios legales y operativos |
| 6 | Arquitectura funcional |
| 7 | Requerimientos funcionales |
| 8 | Reglas de negocio y liquidación |
| 9 | Flujos críticos |
| 10 | Modelo de datos |
| 11 | Integraciones |
| 12 | Requerimientos no funcionales |
| 13 | Seguridad, privacidad y cumplimiento |
| 14 | Arquitectura técnica recomendada |
| 15 | Métricas y analítica |
| 16 | Alcance del MVP y hoja de ruta |
| 17 | Criterios de salida del MVP |
| 18 | Riesgos y mitigaciones |
| 19 | Decisiones pendientes |
| 20 | Fuentes oficiales |


# 1. Resumen ejecutivo
El producto será una plataforma móvil y web para que familias empleadoras, trabajadoras de casas particulares, niñeras y contadores administren de forma ordenada la relación laboral. Su núcleo es el ciclo mensual de fichaje, liquidación, recibo oficial, pago y conciliación. La búsqueda de personal verificado es una segunda capa comercial, no el único producto.

[TABLA 6]
| Propuesta de valor / “Encontrá o incorporá a tu trabajadora, registrá las horas, calculá correctamente el sueldo y dejá ARCA administrada, con trazabilidad para ambas partes.” |

- La familia conserva el carácter de empleadora y aprueba horarios, novedades, liquidaciones y pagos.
- La trabajadora accede gratuitamente a fichajes, horas, recibos, pagos y solicitudes de corrección.
- El contador matriculado puede revisar y administrar tareas en ARCA únicamente mediante autorización formal y con su propia clave fiscal.
- La plataforma nunca almacena claves fiscales ni recibe el sueldo en cuentas propias.
- La emisión oficial del recibo se realiza en ARCA. La aplicación prepara, guía, importa, valida y concilia el resultado.

# 2. Visión, objetivos y métricas

## 2.1 Visión del producto
Convertirse en el sistema operativo de la relación laboral doméstica en Argentina: simple para una familia, transparente para la trabajadora y eficiente para el profesional que administra obligaciones.

## 2.2 Objetivos de negocio
- Generar ingresos recurrentes mediante planes de administración mensual.
- Reducir errores de cálculo, vencimientos omitidos y documentación dispersa.
- Mejorar la formalización sin reemplazar los sistemas oficiales.
- Crear una base de confianza y reputación que luego sostenga el marketplace.
- Permitir que contadores administren un volumen alto de familias desde una sola cola operativa.

## 2.3 Indicadores principales

[TABLA 7]
| Indicador | Definición | Meta de validación inicial |
| Activación de familia | Crea una relación laboral y configura un período. | ≥ 60% de familias registradas |
| Adopción de fichaje | Jornadas registradas sobre jornadas previstas. | ≥ 70% |
| Liquidaciones cerradas | Períodos aprobados sobre relaciones activas. | ≥ 60% mensual |
| Conciliación completa | Recibo oficial, sueldo y aportes vinculados. | ≥ 50% en piloto |
| Conversión a pago | Familias con plan pago sobre activadas. | ≥ 30% |
| Retención | Familias que continúan al mes siguiente. | ≥ 80% |
| Errores críticos | Liquidaciones con error legal o monetario. | 0; todo incidente se rectifica y audita |
| Tiempo operativo contador | Minutos de trabajo por familia y período. | Medir y reducir por automatización |


# 3. Alcance del producto

## 3.1 Alcance obligatorio del MVP
- Registro y autenticación de familia, trabajadora, contador y personal interno.
- Alta de una relación laboral existente, domicilio, categoría, modalidad, salario y horario.
- Fichaje mediante botón, QR, PIN o validación de proximidad configurable.
- Cierre mensual y motor de liquidación parametrizable por vigencia.
- Gestión de vacaciones, aguinaldo, licencias, feriados, horas extras y novedades.
- Flujo de revisión profesional y cola de tareas para contadores.
- Asistente de ARCA: checklist, enlaces seguros, importación del recibo y conciliación.
- Pago directo a la trabajadora mediante proveedor externo o registro de transferencia.
- Repositorio documental, alertas, auditoría y panel administrativo.
- Suscripciones y facturación de los servicios de la plataforma y del profesional.

## 3.2 Segunda etapa
- Perfiles públicos de trabajadoras, verificación de referencias y certificaciones.
- Publicación de búsquedas, matching, chat protegido y entrevistas.
- Contratación asistida y garantía de reemplazo.
- Planes corporativos para empleados de empresas.
- Capacitaciones, beneficios y seguros de terceros.

## 3.3 Fuera de alcance inicial
- Actuar como empleador de las trabajadoras o asignarlas bajo dirección operativa de la plataforma.
- Recibir, custodiar o distribuir fondos salariales desde cuentas propias.
- Almacenar clave fiscal, cookies o credenciales de ARCA.
- Automatizar el portal de ARCA mediante scraping, robots de navegador o ingeniería inversa.
- Emitir un recibo privado como sustituto del recibo oficial de ARCA.
- Ofrecer asesoramiento médico, terapéutico o de cuidado profesional regulado.

# 4. Usuarios y responsabilidades

[TABLA 8]
| Rol | Responsabilidad principal |
| Familia / empleador | Contrata; informa datos; aprueba jornadas, novedades, liquidación y pago; gestiona o delega ARCA. |
| Trabajadora | Registra jornada; revisa horas; presenta novedades; consulta liquidaciones, recibos y pagos. |
| Contador matriculado | Revisa cálculos; administra tareas autorizadas; opera con su propia clave; conserva trazabilidad profesional. |
| Verificador | Valida identidad, referencias y documentación de perfiles del marketplace. |
| Soporte | Atiende consultas, pero no modifica liquidaciones cerradas sin flujo autorizado. |
| Administrador de plataforma | Gestiona usuarios, parámetros, planes, contenido, incidentes y configuración. |
| Auditor / cumplimiento | Consulta registros de actividad, consentimientos, accesos y decisiones sensibles. |


## 4.1 Matriz de permisos resumida

[TABLA 9]
| Acción | Familia | Trabajadora | Contador | Interno |
| Ver relación laboral | Sí | Sí | Asignadas | Soporte limitado |
| Editar condiciones | Sí | Solicita | Asiste | No |
| Fichar | Consulta | Sí | No | No |
| Aprobar horas | Sí | Acepta/objeta | Consulta | No |
| Generar preliquidación | Sí | Consulta | Sí | No |
| Aprobar liquidación | Sí | Consulta | Revisa | No |
| Operar ARCA | Sí | No | Sólo autorizado | No |
| Registrar pago | Sí | Confirma recepción | Consulta | No |
| Modificar parámetros legales | No | No | Propone | Administrador autorizado |


# 5. Principios legales y operativos

[TABLA 10]
| Principio | Aplicación en el producto |
| Empleador | La familia empleadora conserva la dirección y responsabilidad de la relación. La plataforma es tecnología e intermediación. |
| Recibo oficial | El recibo de sueldo debe emitirse electrónicamente mediante el servicio oficial de ARCA vigente. [F2][F3] |
| Clave fiscal | Es personal e intransferible. La aplicación no la solicita ni almacena. La representación se realiza mediante delegación de servicios cuando corresponda. [F7] |
| ARCA | El catálogo público consultado no publica un web service específico de Casas Particulares. Debe existir un flujo asistido que no dependa de una API. [F5][F6] |
| Contador | Los servicios profesionales deben prestarse por profesionales matriculados en la jurisdicción correspondiente. [F11][F12] |
| Pago | El salario se transfiere directamente desde la familia a la trabajadora. Si se inicia el pago desde la app, se usa un banco o PSP registrado. [F10] |
| Privacidad | La recolección de identidad, ubicación, referencias y documentación debe ser informada, proporcional y revocable según corresponda. [F9] |
| Trazabilidad | Toda aprobación, corrección, cálculo, documento y pago debe quedar registrado con usuario, fecha y versión. |


[TABLA 11]
| Validación jurídica obligatoria antes del lanzamiento / Confirmar con asesoría laboral y ARCA: delegabilidad del servicio “Personal de Casas Particulares”, alcance de la actuación del contador, textos contractuales, retención documental, geolocalización y responsabilidades por errores de liquidación. |


# 6. Arquitectura funcional
La plataforma coordina cuatro actores principales y mantiene separadas las responsabilidades laborales, profesionales y financieras.
Figura 1. Ecosistema funcional recomendado.

# 7. Requerimientos funcionales
Cada requerimiento posee un identificador estable para estimación, diseño, desarrollo, pruebas y control de cambios. “Debe” integra el MVP; “Debería” es prioritario para la siguiente versión; “Podría” es opcional.

## 7.1 Identidad, acceso y consentimiento

[TABLA 12]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| SEG-01 | Registrar usuarios por correo o teléfono y validar mediante código de un solo uso. | Debe | La cuenta no se activa sin validación y se evita la duplicación por identidad. |
| SEG-02 | Exigir segundo factor para contadores, administradores y acciones críticas. | Debe | Una operación sensible requiere MFA vigente. |
| SEG-03 | Aplicar permisos por rol y por relación laboral. | Debe | Un usuario no accede a relaciones no vinculadas. |
| SEG-04 | Versionar términos, privacidad, geolocalización y autorizaciones. | Debe | Se conserva texto, versión, fecha, IP/dispositivo y aceptación. |
| SEG-05 | Permitir cerrar sesiones y revocar dispositivos. | Debería | El usuario ve sesiones activas y puede invalidarlas. |
| SEG-06 | Prohibir el ingreso o almacenamiento de clave fiscal. | Debe | No existe campo, log ni integración que capture credenciales de ARCA. |
| SEG-07 | Permitir descargar datos y solicitar cierre de cuenta. | Debe | La solicitud sigue un flujo con conservación legal documentada. |
| SEG-08 | Registrar auditoría de accesos y cambios sensibles. | Debe | Cada evento conserva actor, fecha, entidad, acción y valores relevantes. |


## 7.2 Perfiles y verificación

[TABLA 13]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| PER-01 | Crear perfil de trabajadora con experiencia, tareas, disponibilidad, zona y modalidad. | Debe | El perfil puede guardarse incompleto y muestra porcentaje de avance. |
| PER-02 | Crear perfil de familia y domicilios laborales. | Debe | La dirección exacta sólo es visible a usuarios autorizados. |
| PER-03 | Validar identidad mediante proveedor o revisión interna. | Debe | El resultado queda como estado, fecha y proveedor; no como exposición pública de documentos. |
| PER-04 | Incorporar selfie y prueba de vida cuando se use verificación remota. | Debería | La verificación se ejecuta con consentimiento y política de retención. |
| PER-05 | Registrar y verificar referencias laborales. | Debería | Cada referencia tiene estado, fecha, verificador y notas restringidas. |
| PER-06 | Cargar certificados y capacitaciones con vencimiento. | Debería | El sistema alerta documentos vencidos y no los presenta como vigentes. |
| PER-07 | Configurar radio de traslado, disponibilidad y expectativa económica. | Debería | El matching respeta restricciones declaradas. |
| PER-08 | Controlar qué datos se comparten antes y después del match. | Debe | Teléfono y domicilio no se exponen antes de la autorización. |
| PER-09 | Gestionar estados: borrador, validando, activo, suspendido y bloqueado. | Debe | Cada transición requiere motivo y queda auditada. |
| PER-10 | Permitir reportar perfiles e incidentes de confianza. | Debe | El reporte crea un caso interno con prioridad y evidencia. |


## 7.3 Marketplace y contratación

[TABLA 14]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| MKT-01 | Permitir que una familia publique una necesidad estructurada. | Debería | Incluye zona, horarios, tareas, modalidad, fecha y presupuesto. |
| MKT-02 | Calcular compatibilidad por disponibilidad, distancia, experiencia y preferencias. | Debería | Se muestra explicación simple del match; no se usan atributos sensibles prohibidos. |
| MKT-03 | Presentar una lista corta y filtros. | Debería | La familia puede comparar candidatas sin acceder a datos privados. |
| MKT-04 | Proveer mensajería interna y protección contra intercambio prematuro de datos. | Debería | La plataforma registra bloqueos, reportes y consentimiento de contacto. |
| MKT-05 | Coordinar entrevistas y recordatorios. | Podría | Ambas partes reciben confirmación y pueden reprogramar. |
| MKT-06 | Emitir una propuesta con condiciones resumidas. | Debería | Las partes aceptan o rechazan; la aceptación crea un borrador de relación. |
| MKT-07 | Administrar garantía de reemplazo según el plan. | Podría | Se valida elegibilidad, plazo, motivo y reemplazos consumidos. |
| MKT-08 | Aplicar reglas de publicación y moderación. | Debe | La plataforma impide solicitudes ilegales, discriminatorias o de tareas fuera del alcance. |


## 7.4 Relación laboral

[TABLA 15]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| REL-01 | Dar de alta en la app una relación existente sin pasar por el marketplace. | Debe | La familia invita a la trabajadora y ambas ven los datos acordados. |
| REL-02 | Registrar fecha de inicio, categoría, modalidad, remuneración, horario y domicilio. | Debe | Los campos obligatorios validan consistencia y vigencia. |
| REL-03 | Mantener múltiples domicilios o relaciones por trabajadora. | Debe | Cada relación tiene permisos, calendario y liquidación independientes. |
| REL-04 | Registrar horario previsto y reglas de fichaje. | Debe | El calendario genera jornadas esperadas y excepciones. |
| REL-05 | Versionar cambios con fecha de vigencia. | Debe | Nunca se sobreescriben condiciones históricas usadas en una liquidación. |
| REL-06 | Adjuntar acuerdos, constancias y documentos. | Debe | Los archivos quedan asociados a la relación y con acceso restringido. |
| REL-07 | Gestionar suspensión, baja y cierre documental. | Debe | El flujo exige fecha, motivo, pendientes y exportación final. |
| REL-08 | Registrar aceptación bilateral de condiciones y cambios. | Debería | La aceptación identifica versión, usuario, fecha y evidencia. |


## 7.5 Fichaje y novedades

[TABLA 16]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| FIC-01 | Registrar entrada y salida desde la aplicación móvil. | Debe | La jornada muestra hora, método y estado de sincronización. |
| FIC-02 | Soportar QR, PIN y validación de proximidad configurables. | Debe | La familia elige método; el sistema registra el método usado. |
| FIC-03 | Permitir fichaje sin conexión con sincronización posterior. | Debería | Se conserva hora segura del dispositivo, integridad y marca de carga tardía. |
| FIC-04 | Configurar redondeo y tolerancias sin ocultar el tiempo real. | Debe | Se guardan hora real y hora computable con regla aplicada. |
| FIC-05 | Registrar pausas y jornadas partidas. | Debe | La suma de tramos alimenta las horas computables. |
| FIC-06 | Solicitar corrección de un fichaje con motivo. | Debe | La corrección nunca borra el original y requiere aprobación. |
| FIC-07 | Permitir aprobación mensual de jornadas por la familia. | Debe | Las jornadas aprobadas quedan bloqueadas salvo reapertura auditada. |
| FIC-08 | Detectar fichaje faltante, duplicado o inconsistente. | Debe | El sistema genera una alerta y no inventa horarios. |
| FIC-09 | Limitar la ubicación al momento del fichaje. | Debe | No existe seguimiento continuo; la finalidad se informa expresamente. |
| FIC-10 | Exportar detalle de horas y modificaciones. | Debería | Se genera PDF/CSV legible por período y relación. |


## 7.6 Motor de liquidación

[TABLA 17]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| LIQ-01 | Crear períodos mensuales y liquidaciones extraordinarias. | Debe | Cada período posee estado, versión y fecha de cierre. |
| LIQ-02 | Mantener escalas salariales y parámetros con vigencia. | Debe | Cada cálculo referencia una versión inmutable del parámetro. |
| LIQ-03 | Soportar categorías y modalidades legales configurables. | Debe | El catálogo se administra sin desplegar una nueva versión de la app. |
| LIQ-04 | Liquidar remuneración por hora o mensual. | Debe | La fórmula y base se muestran en el detalle. |
| LIQ-05 | Calcular horas extra, feriados y jornadas especiales. | Debe | El resultado explica cantidad, tasa y fuente del parámetro. |
| LIQ-06 | Calcular antigüedad y adicionales aplicables. | Debe | La vigencia y porcentaje quedan documentados. |
| LIQ-07 | Gestionar ausencias, licencias y días no trabajados. | Debe | Cada novedad posee tipo, respaldo, impacto y aprobación. |
| LIQ-08 | Calcular vacaciones, sueldo anual complementario y liquidaciones finales. | Debe | El sistema admite revisión obligatoria por profesional en casos complejos. |
| LIQ-09 | Registrar adelantos y descuentos sólo desde un catálogo permitido. | Debe | No se aplica un descuento sin fundamento, límite y aceptación requerida. |
| LIQ-10 | Comparar contra mínimos legales vigentes. | Debe | No se cierra una liquidación por debajo del mínimo sin alerta bloqueante o justificación autorizada. |
| LIQ-11 | Mostrar preliquidación detallada antes de aprobar. | Debe | Familia y contador ven conceptos, cantidades, tasas y total. |
| LIQ-12 | Aprobar, cerrar y bloquear la liquidación. | Debe | El cierre exige actor autorizado y genera un número interno. |
| LIQ-13 | Rectificar sin borrar versiones anteriores. | Debe | La nueva versión referencia a la anterior y registra el motivo. |
| LIQ-14 | Proveer explicación legible del cálculo. | Debe | Cada línea muestra fórmula, datos de entrada, parámetro y redondeo. |


## 7.7 ARCA y recibo oficial

[TABLA 18]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| ARC-01 | Mostrar tablero de obligaciones por relación y período. | Debe | Distingue pendiente, en proceso, cumplida, observada y vencida. |
| ARC-02 | Guiar el alta y mantenimiento de la relación en ARCA. | Debe | El asistente presenta checklist y enlaces oficiales actualizables. |
| ARC-03 | Abrir ARCA sólo mediante enlace seguro al dominio oficial. | Debe | No se incrusta ni imita el login; el dominio se muestra claramente. |
| ARC-04 | Preparar los valores que la familia debe informar en el recibo. | Debe | La pantalla permite copiar conceptos sin capturar credenciales. |
| ARC-05 | Importar el recibo oficial en PDF o mediante compartir archivo. | Debe | El archivo queda vinculado al período y se verifica integridad básica. |
| ARC-06 | Leer y validar el QR público del recibo cuando esté disponible. | Debe | Se conserva resultado, fecha y datos comprobados. |
| ARC-07 | Comparar el recibo oficial con la preliquidación. | Debe | Las diferencias se clasifican y bloquean la conciliación hasta resolver. |
| ARC-08 | Registrar comprobantes de aportes, contribuciones y ART. | Debe | El período muestra importe, fecha, medio y comprobante. |
| ARC-09 | Administrar checklist de delegación al contador. | Debe | Se registra servicio, representado, autorizado, fecha y revocación; no credenciales. |
| ARC-10 | Ofrecer alternativa guiada cuando el servicio no sea delegable. | Debe | El contador revisa y la familia ejecuta la operación oficial. |
| ARC-11 | Implementar un adaptador desacoplado para una futura API oficial. | Debería | La integración puede habilitarse por configuración sin reescribir el dominio de liquidación. |
| ARC-12 | Mantener homologación y producción separadas si ARCA habilita un WSN. | Debería | Certificados, endpoints y registros se segregan por ambiente. |


## 7.8 Servicio de contador

[TABLA 19]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| CON-01 | Asignar un contador a una familia según jurisdicción, capacidad y plan. | Debe | La asignación queda aceptada por ambas partes. |
| CON-02 | Verificar matrícula, jurisdicción y vigencia profesional. | Debe | No se habilita la operación sin evidencia vigente. |
| CON-03 | Generar carta de encargo y alcance del servicio. | Debe | La familia acepta tareas incluidas, exclusiones, honorarios y responsabilidades. |
| CON-04 | Registrar el estado de delegación de servicios en ARCA. | Debe | El contador no marca una tarea como operable sin autorización verificada. |
| CON-05 | Proveer una cola de períodos, vencimientos y observaciones. | Debe | El profesional prioriza por fecha y riesgo. |
| CON-06 | Revisar y aprobar técnicamente la liquidación. | Debe | La revisión registra profesional, matrícula, fecha y observaciones. |
| CON-07 | Cargar o vincular recibos y comprobantes oficiales. | Debe | Cada documento conserva origen y período. |
| CON-08 | Solicitar información faltante a la familia. | Debe | La tarea queda pausada con motivo, vencimiento y notificación. |
| CON-09 | Registrar notas profesionales privadas y notas compartidas. | Debería | Los permisos distinguen información interna y visible al cliente. |
| CON-10 | Definir niveles de servicio y escalamiento. | Debería | Se mide tiempo de primera respuesta y resolución. |
| CON-11 | Aplicar segregación entre quien configura parámetros y quien revisa. | Debe | Los cambios de tablas legales requieren doble control. |
| CON-12 | Liquidar honorarios y comisión de la plataforma por separado. | Debe | La factura o comprobante identifica prestador y concepto. |
| CON-13 | Revocar acceso y reasignar cartera. | Debe | Al finalizar el vínculo se cierran permisos y se conserva la auditoría. |


## 7.9 Pagos y conciliación

[TABLA 20]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| PAG-01 | Permitir iniciar o registrar el pago del sueldo. | Debe | La familia confirma monto, beneficiaria, período y cuenta destino. |
| PAG-02 | Enviar el sueldo directamente a la cuenta de la trabajadora. | Debe | La plataforma no custodia ni intermedia fondos salariales. |
| PAG-03 | Integrar sólo bancos o PSP habilitados para la función utilizada. | Debe | El proveedor y su estado regulatorio quedan documentados. |
| PAG-04 | Recibir confirmación segura de la transferencia. | Debería | El webhook o comprobante se valida e idempotentemente actualiza el pago. |
| PAG-05 | Guardar número de transacción y comprobante. | Debe | El dato queda asociado a período, monto y partes. |
| PAG-06 | Conciliar sueldo, recibo oficial y obligaciones. | Debe | El período sólo queda completo cuando no existen diferencias pendientes. |
| PAG-07 | Prevenir pagos duplicados y manejar fallas. | Debe | La operación usa clave idempotente y estado recuperable. |
| PAG-08 | Cobrar suscripciones y servicios profesionales. | Debe | Los cobros se separan del salario y poseen comprobante. |
| PAG-09 | Gestionar cancelaciones, devoluciones y notas de crédito. | Debería | Toda devolución conserva origen, motivo y autorización. |
| PAG-10 | Permitir carga manual de pagos realizados fuera de la app. | Debe | La familia adjunta comprobante y el sistema marca origen manual. |


## 7.10 Documentos, avisos y soporte

[TABLA 21]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| DOC-01 | Almacenar recibos, comprobantes, acuerdos y certificados cifrados. | Debe | Los objetos no son públicos y usan enlaces temporales. |
| DOC-02 | Clasificar documentos por tipo, período, relación y retención. | Debe | La búsqueda devuelve sólo contenido autorizado. |
| DOC-03 | Calcular hash y registrar versión de documentos críticos. | Debería | Puede verificarse que el archivo no cambió desde su carga. |
| DOC-04 | Analizar archivos por malware y limitar formatos/tamaño. | Debe | Un archivo inseguro no queda disponible. |
| DOC-05 | Exportar un legajo completo por relación. | Debe | La exportación incluye índice, documentos y auditoría relevante. |
| NOT-01 | Enviar recordatorios de fichaje, cierre, recibo, pago y vencimientos. | Debe | Las notificaciones usan zona horaria local y evitan duplicados. |
| NOT-02 | Soportar push, correo y WhatsApp/SMS mediante proveedores. | Debería | El usuario elige canal y horario salvo avisos legales críticos. |
| NOT-03 | Mantener plantillas versionadas y registro de entrega. | Debe | Se conoce qué mensaje recibió cada usuario. |
| SUP-01 | Crear tickets con categorías, prioridad y adjuntos. | Debe | Cada caso posee responsable, estado y trazabilidad. |
| SUP-02 | Escalar incidentes laborales, de privacidad, fraude o seguridad. | Debe | Los casos críticos activan protocolo y acceso restringido. |


## 7.11 Administración y analítica

[TABLA 22]
| ID | Requerimiento | Prioridad | Criterio de aceptación |
| ADM-01 | Administrar usuarios, roles, relaciones y bloqueos. | Debe | Las acciones administrativas requieren motivo y auditoría. |
| ADM-02 | Gestionar escalas, conceptos, fórmulas y vigencias. | Debe | Los cambios pasan por borrador, revisión, publicación y rollback. |
| ADM-03 | Configurar planes, precios, límites y beneficios. | Debe | El cambio no altera retroactivamente contratos vigentes. |
| ADM-04 | Usar feature flags para funciones sensibles. | Debería | Puede habilitarse una función por ambiente, usuario o porcentaje. |
| ADM-05 | Moderación de perfiles, publicaciones, reseñas y reportes. | Debe | Se conserva evidencia y fundamento de cada decisión. |
| ADM-06 | Panel de obligaciones, fallas, fraude y actividad profesional. | Debe | Los indicadores tienen filtros y exportación. |
| ADM-07 | Administrar contenido legal y guías de ARCA. | Debe | Cada contenido tiene propietario, fecha de revisión y fuente. |
| ADM-08 | Consultar auditoría sin modificarla. | Debe | Los registros son inmutables para usuarios operativos. |
| ADM-09 | Detectar señales de fichajes o pagos anómalos. | Debería | La señal genera revisión; no toma decisiones laborales automáticas. |
| ADM-10 | Anonimizar datos para analítica. | Debe | Los tableros no exponen información personal innecesaria. |


# 8. Reglas de negocio y liquidación

[TABLA 23]
| Regla | Descripción |
| RN-01 | Toda tabla salarial, porcentaje, tope, aporte o regla debe tener fecha desde/hasta y fuente oficial. |
| RN-02 | Una liquidación cerrada conserva la versión exacta de parámetros utilizada. |
| RN-03 | El sistema no debe inferir una jornada faltante; solicita corrección. |
| RN-04 | Las horas reales y las horas computables se guardan separadamente. |
| RN-05 | La familia aprueba novedades; el contador puede observar o devolver, no inventar hechos. |
| RN-06 | Toda modificación posterior al cierre crea una rectificativa. |
| RN-07 | Los mínimos legales generan validaciones bloqueantes configurables. |
| RN-08 | El recibo oficial de ARCA prevalece como documento laboral oficial; la app conserva la preliquidación y conciliación. |
| RN-09 | El salario no se mezcla con suscripciones, comisiones u honorarios. |
| RN-10 | Las cuentas bancarias de destino requieren confirmación reforzada antes del primer pago o de un cambio. |
| RN-11 | Un contador sólo opera relaciones asignadas y autorizadas. |
| RN-12 | Las fórmulas deben ser explicables, probadas y aprobadas por un responsable profesional. |
| RN-13 | Los cálculos monetarios se realizan con precisión decimal y reglas de redondeo documentadas. |
| RN-14 | La aplicación debe soportar cambios normativos sin actualizar las apps móviles. |
| RN-15 | Las reseñas no pueden exponer datos sensibles ni reemplazar procedimientos de incidentes. |


## 8.1 Parámetros que debe manejar el motor
- Categoría laboral y tipo de tareas.
- Modalidad con retiro o sin retiro.
- Esquema por hora o mensual.
- Vigencia de remuneraciones mínimas.
- Adicional por antigüedad y otros adicionales vigentes.
- Zona desfavorable cuando corresponda.
- Horas extra, feriados y descansos.
- Vacaciones, licencias y sueldo anual complementario.
- Aportes, contribuciones y ART por tramo o regla vigente.
- Redondeos, topes y controles de consistencia.

[TABLA 24]
| Control de cambios normativos / Los parámetros legales no deben estar escritos directamente en el código. Se administran en tablas versionadas, con revisión de dos personas, pruebas de regresión y fecha de publicación. |


# 9. Flujos críticos

## 9.1 Incorporar una relación existente
- La familia crea su cuenta, acepta términos y valida identidad básica.
- Carga el domicilio laboral e invita a la trabajadora.
- La trabajadora acepta la vinculación y completa sus datos.
- La familia configura categoría, modalidad, fecha, horario y remuneración.
- El sistema ejecuta controles y genera un resumen para aceptación.
- Se configura fichaje y calendario; la relación pasa a “activa”.

## 9.2 Ciclo mensual
Figura 2. Flujo mensual del MVP.

## 9.3 Administración por contador
- La familia contrata el plan profesional y acepta la carta de encargo.
- El sistema verifica matrícula y asigna al contador.
- La familia completa la delegación de servicio en ARCA, si el servicio específico lo permite.
- El contador acepta la delegación con su propia clave fiscal y la plataforma registra el estado, no la credencial.
- El contador revisa la preliquidación, solicita faltantes y ejecuta o guía la tarea oficial.
- El recibo y comprobantes se cargan, concilian y quedan disponibles para las partes.
- La familia puede revocar la autorización y reasignar el servicio.

## 9.4 Rectificación
- Se detecta una diferencia después del cierre.
- Un usuario autorizado abre una solicitud con motivo y evidencia.
- El sistema crea una copia de la liquidación; la versión original permanece inalterada.
- El contador revisa y se genera la rectificación correspondiente en ARCA si aplica.
- Se reconcilian diferencias de pago y se notifica a ambas partes.

# 10. Modelo de datos

[TABLA 25]
| Entidad | Contenido mínimo |
| Usuario | Identidad de acceso, estado, dispositivos, autenticación y rol. |
| Familia | Datos del empleador, preferencias, domicilios y plan. |
| Trabajadora | Perfil, disponibilidad, verificaciones, referencias y relaciones. |
| Contador | Matrícula, jurisdicción, capacidad, cartera y documentación. |
| Relación laboral | Partes, domicilio, fechas, categoría, modalidad y condiciones versionadas. |
| Horario previsto | Reglas semanales, excepciones y feriados. |
| Fichaje | Entrada, salida, método, ubicación mínima, hora real, hora computable y estado. |
| Novedad | Ausencia, licencia, feriado, adelanto, corrección o evento del período. |
| Período de liquidación | Estado, versión, parámetros, aprobación y cierre. |
| Concepto liquidado | Código, fórmula, cantidad, tasa, monto y explicación. |
| Versión normativa | Fuente, vigencia, parámetros, aprobadores y estado. |
| Tarea ARCA | Tipo, responsable, vencimiento, estado, delegación y evidencia. |
| Recibo oficial | Archivo, QR, datos extraídos, validación y relación con liquidación. |
| Pago | Monto, origen, destino, transacción, comprobante y conciliación. |
| Documento | Tipo, propietario, permisos, hash, retención y archivo. |
| Consentimiento | Texto, versión, finalidad, usuario, fecha y revocación. |
| Auditoría | Actor, evento, entidad, antes/después, fecha, IP y dispositivo. |
| Búsqueda / postulación | Necesidad, candidata, match, comunicación y estado. |
| Incidente | Tipo, gravedad, evidencia, responsables, resolución y notificaciones. |
| Suscripción | Plan, beneficiarios, precio, ciclo, estado y cobros. |


# 11. Integraciones

[TABLA 26]
| Integración | Etapa | Requerimiento |
| ARCA - portal oficial | MVP | Enlaces, checklist, importación de PDF/QR y conciliación. No captura credenciales. |
| ARCA - web services | Condicional | La infraestructura WSAA/WSN existe, pero se integra sólo si ARCA publica y autoriza un servicio aplicable. [F5][F6] |
| Administrador de Relaciones | MVP operativo | Guía y registro de delegación al contador; validar disponibilidad del servicio específico. [F7] |
| Banco o PSP | MVP | Pago directo e iniciación/confirmación mediante proveedor habilitado. [F10] |
| Verificación de identidad | MVP o manual | DNI, selfie y prueba de vida mediante proveedor con contrato de tratamiento. |
| Correo / push / mensajería | MVP | Avisos operativos y legales con consentimiento y preferencia de canal. |
| Almacenamiento de documentos | MVP | Object storage privado, cifrado, antivirus, retención y enlaces temporales. |
| Analítica | MVP | Eventos anonimizados o seudonimizados; sin datos laborales detallados en herramientas publicitarias. |


## 11.1 Diseño preparado para una futura API de ARCA
- Crear una interfaz interna “ARCAConnector” con operaciones abstractas: consultar relación, generar recibo, consultar obligaciones, descargar documento y consultar estado.
- Implementar inicialmente un conector manual/asistido que sólo gestiona tareas y documentos.
- Mantener certificados y secretos exclusivamente en un gestor seguro del backend.
- Separar ambientes de homologación y producción.
- Usar idempotencia, reintentos controlados, trazas y correlación de solicitudes.
- Activar el conector oficial mediante feature flag y sólo después de homologación y autorización contractual.

# 12. Requerimientos no funcionales

[TABLA 27]
| ID | Atributo | Requerimiento |
| NFR-01 | Seguridad | TLS vigente en tránsito y cifrado fuerte en reposo para bases, documentos y copias. |
| NFR-02 | Disponibilidad | Objetivo inicial 99,5% mensual; servicios críticos con monitoreo y recuperación documentada. |
| NFR-03 | Rendimiento | Pantallas comunes en menos de 2 segundos en condiciones normales; cierre mensual en menos de 10 segundos por relación. |
| NFR-04 | Escalabilidad | Diseño para crecer desde un piloto hasta 100.000 usuarios sin reescribir el dominio. |
| NFR-05 | Respaldo | Copias automáticas, pruebas de restauración y objetivos RPO/RTO aprobados por negocio. |
| NFR-06 | Accesibilidad | Cumplimiento de WCAG 2.1 AA en web y prácticas equivalentes en móvil. |
| NFR-07 | Compatibilidad | Web responsive; Android e iOS. El fichaje debe tolerar conectividad inestable. |
| NFR-08 | Localización | Español de Argentina, moneda ARS, fechas locales y zona horaria por domicilio. |
| NFR-09 | Observabilidad | Logs estructurados, métricas, trazas, alertas y tableros sin secretos ni datos excesivos. |
| NFR-10 | Mantenibilidad | Módulos desacoplados, contratos de API, migraciones versionadas y documentación técnica. |
| NFR-11 | Calidad | Pruebas unitarias del motor, regresión de escenarios legales, integración, seguridad y flujos críticos. |
| NFR-12 | Auditoría | Registros inmutables o con controles de integridad y retención diferenciada. |
| NFR-13 | Privacidad | Minimización, finalidad, consentimiento, acceso, rectificación, supresión y exportación. |
| NFR-14 | Continuidad | Plan para caída de ARCA, proveedor de pagos, mensajería o identidad sin perder operaciones. |
| NFR-15 | Usabilidad | Una familia no especialista debe completar el cierre mensual mediante un flujo guiado y lenguaje claro. |


# 13. Seguridad, privacidad y cumplimiento

## 13.1 Controles mínimos de seguridad
- MFA y controles reforzados para profesionales y personal interno.
- RBAC, permisos por objeto y principio de mínimo privilegio.
- Cifrado de documentos, datos bancarios y datos de identidad.
- Gestor de secretos; ninguna clave en código, logs o aplicaciones móviles.
- Protección contra OWASP Top 10, abuso de API, credential stuffing y fraude de cuenta.
- Análisis de dependencias, pruebas de penetración y proceso de gestión de vulnerabilidades.
- Alertas por cambios de CBU/CVU, dispositivos nuevos y operaciones inusuales.
- Registro de administradores y acceso excepcional con justificación y expiración.
- Plan de respuesta a incidentes y notificación según obligación aplicable.

## 13.2 Datos personales
- Informar finalidad, responsable, destinatarios, obligatoriedad y derechos antes de recolectar datos. [F9]
- Recolectar ubicación sólo en fichaje y con precisión mínima necesaria.
- No almacenar antecedentes penales ni datos sensibles sin análisis legal específico y fundamento.
- Permitir acceso, rectificación y supresión conforme a plazos y excepciones legales.
- Formalizar contratos con proveedores que procesen identidad, mensajes, pagos o almacenamiento.
- Definir matriz de retención: documentos laborales, comprobantes, auditoría, chats y datos de perfiles.
- Evitar SDK publicitarios en pantallas o eventos que contengan información laboral o financiera.

## 13.3 Cumplimiento profesional y financiero
- Verificar matrícula del contador y limitar el servicio a la jurisdicción y alcance aplicable. [F11][F12]
- Separar contrato de plataforma, carta de encargo profesional y relación laboral.
- Facturar o documentar separadamente la suscripción, los honorarios profesionales y los servicios de terceros.
- Integrar pagos mediante un proveedor cuya función esté registrada o autorizada por el BCRA. [F10]
- No custodiar fondos de salarios ni presentarse como billetera propia en el MVP.

# 14. Arquitectura técnica recomendada

[TABLA 28]
| Enfoque recomendado / Comenzar con un monolito modular bien separado, no con microservicios. Reduce costo y complejidad mientras conserva límites claros para escalar integraciones, pagos y liquidación. |


[TABLA 29]
| Componente | Recomendación |
| Clientes | Aplicación móvil multiplataforma para familia y trabajadora; panel web para contadores y operaciones; web responsive para autogestión. |
| Backend | API modular con dominios: identidad, relaciones, fichaje, liquidación, ARCA, documentos, pagos, marketplace y soporte. |
| Base de datos | PostgreSQL o equivalente transaccional, con migraciones y auditoría. |
| Documentos | Almacenamiento de objetos privado, cifrado, antivirus y URLs temporales. |
| Procesos asíncronos | Cola de trabajos para notificaciones, conciliaciones, generación de reportes y validaciones. |
| Cache | Cache sólo para datos no críticos; liquidaciones y pagos siempre persisten en fuente transaccional. |
| Integraciones | Capa de adaptadores para ARCA, PSP, identidad, mensajería y analítica. |
| Infraestructura | Entornos separados, infraestructura como código, backups, monitoreo y despliegues reversibles. |


## 14.1 Decisiones técnicas obligatorias
- Usar decimal exacto para dinero; nunca punto flotante binario.
- Todas las operaciones de pago y webhooks deben ser idempotentes.
- Las fórmulas de liquidación deben vivir en un motor probado y versionado, no en interfaces móviles.
- Los eventos de auditoría deben escribirse en la misma transacción o mediante un patrón confiable de outbox.
- Los archivos deben almacenarse fuera de la base de datos, con metadatos y permisos en la base.
- El backend debe validar permisos aun cuando la interfaz oculte funciones.
- No depender de disponibilidad de ARCA para registrar horas o calcular una preliquidación.

# 15. Métricas y analítica

[TABLA 30]
| Dimensión | Métricas |
| Producto | Registro, activación, invitaciones, relaciones activas, fichajes, cierres, recibos importados, pagos y conciliaciones. |
| Negocio | Conversión por plan, ingreso mensual recurrente, cancelaciones, costo de adquisición, margen por familia y por contador. |
| Operaciones | Tiempo por tarea, períodos vencidos, documentos faltantes, diferencias con ARCA, volumen por contador. |
| Calidad | Errores de cálculo, rectificaciones, incidentes, fallas de fichaje, pagos duplicados o rechazados. |
| Marketplace | Tiempo hasta candidatura, entrevistas, contratación, permanencia y reemplazos. |
| Confianza | Perfiles verificados, referencias, reportes, bloqueos y tiempos de resolución. |


[TABLA 31]
| Regla de analítica / Las métricas deben usar identificadores seudónimos. No se enviarán nombres, DNI, CUIL, CBU, domicilios, recibos, montos detallados ni mensajes a plataformas publicitarias. |


# 16. Alcance del MVP y hoja de ruta

[TABLA 32]
| Etapa | Incluye | Criterio |
| Fase 0 - Validación operativa | Prototipo, 20-30 familias, liquidación semimanual, prueba de delegación ARCA y prueba con contadores. | No desarrollar marketplace completo. |
| MVP - Administración | Relaciones existentes, fichaje, liquidación, contador, asistente ARCA, documentos, pagos/conciliación, suscripción y backoffice. | Producto comercial inicial. |
| Versión 1.1 - Confianza | Identidad avanzada, referencias, incidentes, reportes, mejoras de automatización y panel profesional. | Reduce riesgo y costo operativo. |
| Versión 1.2 - Marketplace | Búsquedas, matching, chat, entrevistas, ofertas y garantía de reemplazo. | Se apoya en la base administrada. |
| Versión 2 - Integraciones | API oficial de ARCA si se autoriza, mayor integración bancaria, empresas, seguros y capacitaciones. | No es condición de lanzamiento. |


## 16.1 Historias épicas del MVP
- Como familia, quiero incorporar a mi trabajadora y configurar la relación sin conocimientos contables.
- Como trabajadora, quiero registrar mis horas y objetar errores para tener evidencia transparente.
- Como familia, quiero obtener una liquidación explicada y saber qué debo hacer en ARCA.
- Como contador, quiero revisar muchas familias mediante una cola priorizada y documentada.
- Como familia, quiero pagar directamente y conservar todos los comprobantes juntos.
- Como administradora de la plataforma, quiero actualizar parámetros con control y sin desplegar código.

# 17. Criterios de salida del MVP

[TABLA 33]
| Área | Criterio de aceptación |
| Funcional | Una familia crea relación, invita a trabajadora, configura calendario y completa un período. |
| Fichaje | Entrada, salida, corrección, aprobación y exportación funcionan en línea y con conectividad intermitente. |
| Liquidación | Los escenarios definidos por el profesional pasan pruebas de regresión y explican cada concepto. |
| ARCA | El usuario puede completar el flujo oficial sin entregar su clave a la app; se importa y concilia el recibo. |
| Contador | El profesional gestiona asignación, revisión, faltantes, documentos y cierre con auditoría. |
| Pago | El sueldo se transfiere o registra directamente y se evita duplicación. |
| Seguridad | MFA, permisos, cifrado, backups, monitoreo y pruebas de seguridad aprobados. |
| Privacidad | Consentimientos, política, derechos del titular y retención implementados. |
| Operaciones | Existe protocolo de soporte, incidentes, correcciones y actualización normativa. |
| Negocio | El piloto demuestra familias dispuestas a pagar el plan mensual. |


# 18. Riesgos y mitigaciones

[TABLA 34]
| Riesgo | Impacto | Mitigación |
| No existe API pública de Casas Particulares | Alta | Diseñar flujo asistido y adaptador; gestionar consulta/convenio con ARCA. |
| El servicio específico no es delegable al contador | Alta | Validar en piloto; ofrecer revisión profesional y operación guiada por la familia. |
| Error en una liquidación | Alta | Parámetros versionados, pruebas, doble revisión, rectificativas y seguro profesional. |
| La plataforma parece empleadora | Alta | Contratos, diseño operativo y comunicaciones que preserven decisiones de la familia. |
| Brecha de datos personales | Alta | Minimización, cifrado, MFA, monitoreo, pentest y respuesta a incidentes. |
| Riesgo regulatorio en pagos | Alta | Pago directo mediante proveedor habilitado; no custodiar fondos. |
| Baja disposición a pagar | Media | Piloto pago antes de desarrollar marketplace y automatizaciones costosas. |
| Mercado de dos lados sin densidad | Media | Comenzar por relaciones existentes y una ciudad. |
| Contadores saturados | Media | Cola, plantillas, SLA, asignación por capacidad y automatización progresiva. |
| Cambios normativos frecuentes | Alta | Motor parametrizable, propietario de contenido y proceso de publicación urgente. |
| Fichaje percibido como vigilancia | Media | Ubicación puntual, transparencia, métodos alternativos y beneficio bilateral. |
| Fraude de identidad o referencias | Media | Proveedor de identidad, revisión humana, reportes y límites de exposición. |


# 19. Decisiones pendientes antes de desarrollar

[TABLA 35]
| Decisión | Definición necesaria |
| Mercado inicial | Córdoba Capital, provincia o lanzamiento nacional. |
| Marca y posicionamiento | Administración laboral primero o marketplace primero; se recomienda administración. |
| ARCA | Confirmar por prueba y consulta formal la delegabilidad y existencia de integraciones no públicas. |
| Contadores | Modelo de asociados independientes, estudio propio o combinación. |
| Pagos | Seleccionar banco/PSP, experiencia de consentimiento y modelo de conciliación. |
| Identidad | Proveedor, costo, documentos admitidos y política de retención. |
| Fichaje | Método predeterminado: QR, PIN o proximidad; reglas de offline y tolerancia. |
| Precios | Plan autogestión, revisión y administración completa; reparto con profesionales. |
| Responsabilidad | Seguro, límites contractuales, protocolo de errores y reclamos. |
| Retención | Plazos para documentos laborales, mensajes, fichajes, auditoría y cuentas cerradas. |
| Soporte | Horarios, canales, SLA y tratamiento de casos críticos. |
| Marketplace | Nivel de verificación, garantía y criterios de moderación. |


# 20. Fuentes oficiales y referencias
Las referencias se consultaron para preparar los requisitos y deben revisarse antes de cada publicación normativa o lanzamiento. Los enlaces pueden cambiar.

[TABLA 36]
| Ref. | Fuente | Enlace |
| F1 | ARCA - Casas Particulares | Abrir fuente oficial |
| F2 | ARCA - Resolución General 5850/2026 sobre recibo electrónico | Abrir fuente oficial |
| F3 | ARCA - Requisitos del recibo de sueldo digital | Abrir fuente oficial |
| F4 | ARCA - Aplicación móvil Casas Particulares | Abrir fuente oficial |
| F5 | ARCA - WSAA y certificados para web services | Abrir fuente oficial |
| F6 | ARCA - Catálogo de web services de negocio | Abrir fuente oficial |
| F7 | ARCA - Delegación de servicios y Administrador de Relaciones | Abrir fuente oficial |
| F8 | Ley 26.844 - Régimen de trabajo en casas particulares, texto actualizado | Abrir fuente oficial |
| F9 | Ley 25.326 - Protección de datos personales | Abrir fuente oficial |
| F10 | BCRA - Registro de Proveedores de Servicios de Pago | Abrir fuente oficial |
| F11 | Ley 20.488 - Ejercicio profesional de ciencias económicas | Abrir fuente oficial |
| F12 | CPCE Córdoba - Honorarios indicativos y actualización 2026 | Abrir fuente oficial |


[TABLA 37]
| Próximo entregable recomendado / Usar este documento para estimar el MVP y producir, en este orden: mapa de pantallas, prototipo navegable, backlog de historias de usuario, modelo de datos físico, especificación de APIs y plan de pruebas. |
