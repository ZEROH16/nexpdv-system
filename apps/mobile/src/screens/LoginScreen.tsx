import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "../services/api";
import { api } from "../services/api";

export const LoginScreen = ({ onLogin }: { onLogin: (session: Session) => void }) => {
  const [email, setEmail] = useState("admin@nexpdv.com.br");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const login = async () => {
    setLoading(true);
    setError(undefined);
    try {
      onLogin(await api.login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.brandMark}>
        <Text style={styles.brandMarkText}>N</Text>
      </View>
      <Text style={styles.title}>NexPDV Manager</Text>
      <Text style={styles.subtitle}>Gestao comercial em tempo real</Text>
      <View style={styles.form}>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" />
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Senha" />
        <Pressable style={styles.button} onPress={login} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Entrar</Text>}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F7F8FA" },
  brandMark: { width: 58, height: 58, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#111827" },
  brandMarkText: { color: "#FFFFFF", fontSize: 28, fontWeight: "900" },
  title: { marginTop: 22, fontSize: 32, fontWeight: "900", color: "#111827" },
  subtitle: { marginTop: 6, fontSize: 15, color: "#64748B", fontWeight: "600" },
  form: { marginTop: 28, gap: 12 },
  input: { height: 52, borderRadius: 8, backgroundColor: "#FFFFFF", borderColor: "#E5E7EB", borderWidth: 1, paddingHorizontal: 16, fontSize: 15 },
  button: { height: 52, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#111827" },
  buttonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },
  error: { color: "#DC2626", fontWeight: "700" }
});
