import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatDateTime } from "@nexpdv/shared";
import type { Sale } from "@nexpdv/shared";
import { api } from "../services/api";

export const SalesScreen = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  useEffect(() => {
    api.sales().then(setSales).catch(() => undefined);
  }, []);
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={sales}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<Text style={styles.title}>Vendas</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View>
            <Text style={styles.number}>{item.number}</Text>
            <Text style={styles.meta}>{formatDateTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.total}>{formatCurrency(item.total)}</Text>
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FA" },
  content: { padding: 20 },
  title: { fontSize: 28, fontWeight: "900", marginTop: 16, marginBottom: 16, color: "#111827" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 8, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#E5E7EB", flexDirection: "row", justifyContent: "space-between" },
  number: { fontWeight: "900", color: "#111827" },
  meta: { color: "#64748B", marginTop: 4, fontWeight: "600" },
  total: { fontWeight: "900", color: "#111827" }
});
