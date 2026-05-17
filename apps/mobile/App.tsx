import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import type { Session } from "./src/services/api";
import { api } from "./src/services/api";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ProductsScreen } from "./src/screens/ProductsScreen";
import { SalesScreen } from "./src/screens/SalesScreen";

type Tab = "dashboard" | "sales" | "products";

export default function App() {
  const [session, setSession] = useState<Session>();
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => {
    api.restoreSession().then(setSession).catch(() => undefined);
  }, []);

  const logout = async () => {
    await api.logout();
    setSession(undefined);
  };

  if (!session) return <LoginScreen onLogin={setSession} />;

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        {tab === "dashboard" ? <DashboardScreen session={session} onLogout={logout} /> : null}
        {tab === "sales" ? <SalesScreen /> : null}
        {tab === "products" ? <ProductsScreen /> : null}
      </View>
      <View style={styles.tabs}>
        <TabButton icon="analytics" label="Inicio" active={tab === "dashboard"} onPress={() => setTab("dashboard")} />
        <TabButton icon="receipt" label="Vendas" active={tab === "sales"} onPress={() => setTab("sales")} />
        <TabButton icon="cube" label="Produtos" active={tab === "products"} onPress={() => setTab("products")} />
      </View>
    </SafeAreaView>
  );
}

const TabButton = ({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) => (
  <Pressable style={styles.tabButton} onPress={onPress}>
    <Ionicons name={icon} size={22} color={active ? "#111827" : "#94A3B8"} />
    <Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: "#F7F8FA" },
  content: { flex: 1 },
  tabs: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingVertical: 8 },
  tabButton: { flex: 1, alignItems: "center", gap: 3 },
  tabLabel: { color: "#94A3B8", fontWeight: "800", fontSize: 12 },
  tabActive: { color: "#111827" }
});
