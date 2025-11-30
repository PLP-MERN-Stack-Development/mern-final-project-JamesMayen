import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/UI/card';
import { Button } from '../components/UI/button';
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  User,
  LogOut,
  ChevronDown,
  X
} from 'lucide-react';

const PatientDashboard = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [userDetails, setUserDetails] = useState(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== 'patient') {
        navigate('/login');
        return;
      }
      fetchAppointments();
    }
  }, [user, navigate, authLoading]);

  const fetchAppointments = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/appointments', {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAppointments(data);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const fetchUserDetails = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/auth/profile', {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserDetails(data);
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
    }
  };

  const handleDropdownToggle = () => {
    setIsDropdownOpen(!isDropdownOpen);
    if (!isDropdownOpen && user) {
      fetchUserDetails();
    }
  };

  const updateAppointmentStatus = async (appointmentId, status) => {
    try {
      const res = await fetch(`http://localhost:5000/api/appointments/${appointmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ status })
      });

      if (res.ok) {
        fetchAppointments(); // Refresh data
      }
    } catch (error) {
      console.error('Error updating appointment:', error);
    }
  };

  const tabs = [
    { id: 'upcoming', label: 'Upcoming', icon: Calendar },
    { id: 'pending', label: 'Pending', icon: Clock },
    { id: 'rejected', label: 'Rejected', icon: XCircle },
    { id: 'completed', label: 'Completed', icon: CheckCircle },
  ];

  const renderTabContent = () => {
    const now = new Date();
    let filteredAppointments = [];

    switch (activeTab) {
      case 'upcoming':
        filteredAppointments = appointments.filter(app =>
          app.status === 'confirmed' && new Date(app.date) >= now
        );
        break;
      case 'pending':
        filteredAppointments = appointments.filter(app => app.status === 'pending');
        break;
      case 'rejected':
        filteredAppointments = appointments.filter(app => app.status === 'rejected');
        break;
      case 'completed':
        filteredAppointments = appointments.filter(app => app.status === 'completed');
        break;
      default:
        filteredAppointments = [];
    }

    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-6">{tabs.find(tab => tab.id === activeTab)?.label} Appointments</h2>
        <div className="space-y-4">
          {filteredAppointments.length > 0 ? (
            filteredAppointments.map(appointment => (
              <div key={appointment._id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{appointment.doctor.name}</h3>
                    <p className="text-sm text-gray-600">{appointment.reason}</p>
                    <p className="text-sm text-gray-600">{appointment.date} at {appointment.time}</p>
                    <p className="text-sm text-gray-600">Type: {appointment.type}</p>
                  </div>
                  <div className="flex space-x-2">
                    {(activeTab === 'pending' || activeTab === 'upcoming') && (
                      <>
                        <Button
                          onClick={() => updateAppointmentStatus(appointment._id, 'cancelled')}
                          variant="outline"
                          size="sm"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => alert('Reschedule functionality coming soon')}
                          variant="outline"
                          size="sm"
                        >
                          Reschedule
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className={`mt-2 inline-block px-2 py-1 rounded text-xs font-medium ${
                  appointment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  appointment.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                  appointment.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {appointment.status}
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-600">No {activeTab} appointments.</p>
          )}
        </div>
      </Card>
    );
  };

  if (authLoading || loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* User Icon Header */}
      <header className="bg-white shadow-md" role="banner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-end items-center py-4">
            <div className="relative">
              <button
                onClick={handleDropdownToggle}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="User menu"
                aria-expanded={isDropdownOpen}
                aria-haspopup="true"
              >
                <User className="w-5 h-5" aria-hidden="true" />
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </button>
              {isDropdownOpen && (
                <>
                  <button
                    onClick={() => setIsDropdownOpen(false)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="absolute right-0 mt-2 w-64 sm:w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden">
                    <div className="relative p-4">
                      <button
                        onClick={() => setIsDropdownOpen(false)}
                        className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors duration-200 shadow-sm"
                        aria-label="Close user details"
                      >
                        <X className="w-3 h-3" />
                      </button>

                      <div className="pr-8">
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">User Details</h3>

                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</label>
                            <p className="text-base font-semibold text-gray-900">{userDetails?.name || user?.name || 'User'}</p>
                          </div>

                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</label>
                            <p className="text-sm text-gray-700 break-words">{userDetails?.email || user?.email || 'email@example.com'}</p>
                          </div>

                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Role</label>
                            <p className="text-sm font-medium text-blue-600 capitalize bg-blue-50 px-2 py-1 rounded-md inline-block">
                              {userDetails?.role || user?.role || 'patient'}
                            </p>
                          </div>

                          <div className="border-t pt-3 mt-3">
                            <button
                              onClick={() => {
                                handleLogout();
                                setIsDropdownOpen(false);
                              }}
                              className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition"
                            >
                              <LogOut className="w-4 h-4" />
                              <span>Logout</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="main-content">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-1/4">
            <Card className="p-6">
              <nav className="space-y-2">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center px-4 py-3 rounded-lg text-left ${
                        activeTab === tab.id
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </Card>
          </div>

          <div className="lg:w-3/4">
            {renderTabContent()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PatientDashboard;