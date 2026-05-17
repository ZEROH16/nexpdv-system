import { StyleSheet, Text, View } from "react-native";

export const MetricCard = ({ label, value, tone = "blue" }: { label: string; value: string; tone?: "blue" | "green" | "amber" }) => (
  <View style={[styles.card, tone === "green" && styles.green, tone === "amber" && styles.amber]}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "46%",
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },
  green: { borderColor: "#A7F3D0" },
  amber: { borderColor: "#FDE68A" },
  label: { color: "#64748B", fontWeight: "700", fontSize: 12 },
  value: { color: "#111827", fontWeight: "900", fontSize: 22, marginTop: 8 }
});
