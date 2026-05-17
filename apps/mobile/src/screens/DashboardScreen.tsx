import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatCurrency } from "@nexpdv/shared";
import type { DashboardMetrics } from "@nexpdv/shared";
import type { Session } from "../services/api";
import { api } from "../services/api";
import { getPushToken } from "../services/notifications";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useRealtime } from "../hooks/useRealtime";

export const DashboardScreen = ({ session, onLogout }: { session: Session; onLogout: () => void }) => {
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [refreshing, setRefreshing] = useState(false);
  const { connected, events } = useRealtime();

  const load = async () => {
    setRefreshing(true);
    setMetrics(await api.dashboard());
    setRefreshing(false);
  };

  useEffect(() => {
    load().catch(() => setRefreshing(false));
    getPushToken()
      .then((token) => (token ? api.registerPushToken(token) : undefined))
      .catch(() => undefined);
  }, []);

  if (!metrics && refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#111827" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{session.user.companyName}</Text>
          <Text style={styles.title}>Painel gerencial</Text>
        </View>
        <Pressable style={styles.logout} onPress={onLogout}>
          <Text style={styles.logoutText}>Sair</Text>
        </Pressable>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.dot, connected && styles.dotOnline]} />
        <Text style={styles.status}>{connected ? "Tempo real ativo" : "Reconectando"}</Text>
      </View>

      <View style={styles.metrics}>
        <MetricCard label="Faturamento hoje" value={formatCurrency(metrics?.dailyRevenue ?? 0)} tone="green" />
        <MetricCard label="Vendas hoje" value={String(metrics?.salesCount ?? 0)} />
        <MetricCard label="Lucro" value={formatCurrency(metrics?.estimatedProfit ?? 0)} tone="green" />
        <MetricCard label="Ticket medio" value={formatCurrency(metrics?.averageTicket ?? 0)} />
      </View>

      <Section title="Ranking produtos">
        {metrics?.topProducts.map((product, index) => (
          <View key={product.name} style={styles.listItem}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.listContent}>
              <Text style={styles.itemTitle}>{product.name}</Text>
              <Text style={styles.itemSub}>{product.quantity} unidades</Text>
            </View>
            <Text style={styles.itemValue}>{formatCurrency(product.revenue)}</Text>
          </View>
        ))}
      </Section>

      <Section title="Alertas">
        <View style={styles.alert}>
          <Text style={styles.itemTitle}>Estoque baixo</Text>
          <Text style={styles.itemValue}>{metrics?.lowStockCount ?? 0}</Text>
        </View>
        {events.slice(0, 4).map((event, index) => (
          <View key={`${event.event}-${index}`} style={styles.alert}>
            <Text style={styles.itemTitle}>{event.event}</Text>
            <Text style={styles.itemSub}>{event.sentAt ? new Date(event.sentAt).toLocaleTimeString("pt-BR") : "agora"}</Text>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FA" },
  content: { padding: 20, paddingBottom: 36 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16 },
  eyebrow: { color: "#64748B", fontWeight: "800", fontSize: 12 },
  title: { color: "#111827", fontWeight: "900", fontSize: 28, marginTop: 4 },
  logout: { backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB" },
  logoutText: { fontWeight: "900", color: "#111827" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#F59E0B" },
  dotOnline: { backgroundColor: "#10B981" },
  status: { color: "#64748B", fontWeight: "800" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 20 },
  listItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 8, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  rank: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#EEF2FF", textAlign: "center", textAlignVertical: "center", fontWeight: "900", color: "#2563EB", marginRight: 12 },
  listContent: { flex: 1 },
  itemTitle: { fontWeight: "900", color: "#111827" },
  itemSub: { color: "#64748B", fontWeight: "600", marginTop: 2 },
  itemValue: { fontWeight: "900", color: "#111827" },
  alert: { backgroundColor: "#FFFFFF", borderRadius: 8, padding: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 10, flexDirection: "row", justifyContent: "space-between" }
});
