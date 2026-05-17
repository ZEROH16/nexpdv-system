import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { formatCurrency } from "@nexpdv/shared";
import type { Product } from "@nexpdv/shared";
import { api } from "../services/api";

export const ProductsScreen = () => {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    api.products().then(setProducts).catch(() => undefined);
  }, []);
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={products}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<Text style={styles.title}>Produtos</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.info}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.barcode ?? item.sku}</Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.price}>{formatCurrency(item.price)}</Text>
            <Text style={[styles.stock, item.stock <= item.minStock && styles.low]}>{item.stock} em estoque</Text>
          </View>
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FA" },
  content: { padding: 20 },
  title: { fontSize: 28, fontWeight: "900", marginTop: 16, marginBottom: 16, color: "#111827" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 8, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#E5E7EB", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  info: { flex: 1 },
  name: { fontWeight: "900", color: "#111827" },
  meta: { color: "#64748B", marginTop: 4, fontWeight: "600" },
  right: { alignItems: "flex-end" },
  price: { fontWeight: "900", color: "#111827" },
  stock: { color: "#64748B", marginTop: 4, fontWeight: "700" },
  low: { color: "#D97706" }
});
