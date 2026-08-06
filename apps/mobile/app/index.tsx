import { StyleSheet, Text, View } from 'react-native';

/**
 * Pantalla de fichaje — estructura mínima.
 *
 * El fichaje real (QR, PIN, proximidad, cola offline con `clientIdempotencyKey`
 * y sincronización posterior) se implementa en la Etapa 6, según
 * docs/implementation-roadmap.md §7.
 *
 * Dos reglas que la app debe respetar desde el primer día:
 *  · La ubicación se solicita **sólo** en el momento del fichaje (FIC-09). No se
 *    declaran permisos de ubicación en segundo plano.
 *  · Quien no consienta la ubicación debe poder fichar igual, por QR o PIN
 *    (FIC-02). El fichaje no puede convertirse en vigilancia.
 */
export default function ClockInScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fichaje</Text>
      <Text style={styles.body}>Registro de entrada y salida. Disponible en la próxima etapa.</Text>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          La ubicación se solicita únicamente al fichar, con la precisión mínima necesaria. La
          aplicación no hace seguimiento continuo.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '600' },
  body: { fontSize: 16, textAlign: 'center', opacity: 0.8 },
  notice: {
    marginTop: 24,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  noticeText: { fontSize: 14, lineHeight: 20 },
});
