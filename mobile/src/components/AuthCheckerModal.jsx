import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';

export function AuthCheckerModal({ visible, onConfirm }) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>Access Verification</Text>
          
          <Text style={styles.prompt}>
            Are you a verified local community body member authorized to report incidents and track supplies?
          </Text>

          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠️ This is just a simulation for demo purposes.
            </Text>
          </View>

          <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
            <Text style={styles.confirmButtonText}>Yes, I am Verified</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  prompt: {
    fontSize: 16,
    color: '#D1D5DB',
    textAlign: 'center',
    marginBottom: 24,
  },
  warningBox: {
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderColor: '#EAB308',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    width: '100%',
  },
  warningText: {
    color: '#FDE047',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14,
  },
  confirmButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
