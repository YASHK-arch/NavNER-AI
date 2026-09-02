import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';

export function AddShipmentModal({ visible, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    commodity: 'General Goods',
    priority: 'STANDARD',
    truckId: ''
  });

  const handleSubmit = () => {
    if (onSubmit) onSubmit(formData);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={styles.keyboardView}
          >
            <View style={styles.modalContent}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Create New Shipment</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Origin</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Guwahati Hub"
                  placeholderTextColor="#6b7280"
                  value={formData.origin}
                  onChangeText={t => setFormData({...formData, origin: t})}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Destination</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Silchar"
                  placeholderTextColor="#6b7280"
                  value={formData.destination}
                  onChangeText={t => setFormData({...formData, destination: t})}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.label}>Commodity</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="General Goods"
                    placeholderTextColor="#6b7280"
                    value={formData.commodity}
                    onChangeText={t => setFormData({...formData, commodity: t})}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Priority</Text>
                  <TextInput
                    style={[
                      styles.input, 
                      formData.priority === 'EMERGENCY' && styles.inputEmergency
                    ]}
                    placeholder="STANDARD"
                    placeholderTextColor="#6b7280"
                    value={formData.priority}
                    onChangeText={t => setFormData({...formData, priority: t.toUpperCase()})}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Assign Vehicle</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., AS-01-X-1234"
                  placeholderTextColor="#6b7280"
                  value={formData.truckId}
                  onChangeText={t => setFormData({...formData, truckId: t})}
                />
              </View>

              <View style={styles.footer}>
                <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmit}>
                  <Text style={styles.btnPrimaryText}>Deploy Shipment</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    width: '100%',
  },
  modalContent: {
    backgroundColor: '#1E1E20',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 18,
    color: '#9CA3AF',
  },
  formGroup: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 15,
  },
  inputEmergency: {
    borderColor: '#EF4444',
    color: '#EF4444',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  btnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btnSecondaryText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  btnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#F97316',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
