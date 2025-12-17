// components/pdf/sections/CoverSection.tsx
// PDF cover page with logo, title, and metadata

import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface CoverSectionProps {
  generatedAt: Date;
  userName: string;
}

export function CoverSection({ generatedAt, userName }: CoverSectionProps) {
  const formattedDate = format(generatedAt, 'dd/MM/yyyy', { locale: it });

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            src="/favicon.ico"
            style={styles.logo}
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>Portfolio Report</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>{userName}</Text>

        {/* Date */}
        <Text style={styles.date}>Generato il {formattedDate}</Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Documento generato automaticamente dal Portfolio Tracker.
          </Text>
          <Text style={styles.disclaimerText}>
            I dati riflettono lo stato del portfolio alla data di generazione.
          </Text>
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  logoContainer: {
    marginBottom: 30,
  },
  logo: {
    width: 80,
    height: 80,
  },
  title: {
    fontSize: 36,
    fontFamily: 'Helvetica-Bold',
    color: '#3B82F6',
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 20,
    fontFamily: 'Helvetica',
    color: '#374151',
    marginBottom: 30,
    textAlign: 'center',
  },
  date: {
    fontSize: 14,
    fontFamily: 'Helvetica',
    color: '#6B7280',
    marginBottom: 40,
  },
  divider: {
    width: '60%',
    height: 2,
    backgroundColor: '#3B82F6',
    marginBottom: 40,
  },
  disclaimer: {
    marginTop: 60,
    paddingHorizontal: 60,
  },
  disclaimerText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Oblique',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 6,
  },
});
