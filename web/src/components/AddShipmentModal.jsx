import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import './AddShipmentModal.css';

export default function AddShipmentModal({ isOpen, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    commodity: 'General Goods',
    priority: 'STANDARD',
    truckId: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit) onSubmit(formData);
    onClose();
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Create New Shipment</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Origin</label>
            <div className="input-wrapper">
              <span className="input-icon">📍</span>
              <input 
                type="text" 
                required
                placeholder="e.g., Guwahati Hub"
                value={formData.origin}
                onChange={e => setFormData({...formData, origin: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Destination</label>
            <div className="input-wrapper">
              <span className="input-icon">🏁</span>
              <input 
                type="text" 
                required
                placeholder="e.g., Silchar"
                value={formData.destination}
                onChange={e => setFormData({...formData, destination: e.target.value})}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Commodity Type</label>
              <select 
                value={formData.commodity}
                onChange={e => setFormData({...formData, commodity: e.target.value})}
              >
                <option value="General Goods">📦 General Goods</option>
                <option value="Medical Supplies">💊 Medical Supplies</option>
                <option value="Food Grains">🌾 Food Grains</option>
                <option value="Fuel">⛽ Fuel</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Priority</label>
              <select 
                value={formData.priority}
                onChange={e => setFormData({...formData, priority: e.target.value})}
                className={`priority-select ${formData.priority.toLowerCase()}`}
              >
                <option value="STANDARD">Standard</option>
                <option value="HIGH_PRIORITY">High Priority</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Assign Vehicle</label>
            <div className="input-wrapper">
              <span className="input-icon">🚛</span>
              <input 
                type="text" 
                required
                placeholder="e.g., AS-01-X-1234"
                value={formData.truckId}
                onChange={e => setFormData({...formData, truckId: e.target.value})}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Deploy Shipment</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
