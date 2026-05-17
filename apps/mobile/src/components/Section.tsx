import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.title}>{title}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  section: {
    marginTop: 20
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 12
  }
});
