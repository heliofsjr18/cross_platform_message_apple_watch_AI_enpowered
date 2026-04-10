import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db, firebaseConfig } from '../config/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

type AdminScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AdminDashboard'>;

interface Props {
  navigation: AdminScreenNavigationProp;
}

interface UserData {
  id: string;
  name: string;
  email: string;
}

export default function AdminDashboardScreen({ navigation }: Props) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [createVisible, setCreateVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  
  // Create Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  // Edit Form State
  const [editTargetId, setEditTargetId] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [updatingUser, setUpdatingUser] = useState(false);

  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const fetched: UserData[] = [];
      snapshot.forEach(doc => {
        fetched.push(doc.data() as UserData);
      });
      setUsers(fetched);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ---> CREATE USER (SILENT SECONDARY APP) <---
  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPass.trim()) {
       Alert.alert("Error", "Please fill all fields.");
       return;
    }
    setCreatingUser(true);
    let secondaryApp;
    try {
      secondaryApp = initializeApp(firebaseConfig, "SecondaryApp_\(Date.now())");
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail.trim(), newUserPass);
      const newUid = userCredential.user.uid;

      await setDoc(doc(db, 'users', newUid), {
         id: newUid,
         name: newUserName.trim(),
         email: newUserEmail.trim().toLowerCase(),
         createdAt: Date.now()
      });

      Alert.alert("Success", "New user securely created.");
      setCreateVisible(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPass('');
    } catch (error: any) {
      Alert.alert("Admin Creation Error", error.message);
    } finally {
      setCreatingUser(false);
      if (secondaryApp) await deleteApp(secondaryApp);
    }
  };

  // ---> UPDATE USER <---
  const handleOpenEdit = (user: UserData) => {
    setEditTargetId(user.id);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditVisible(true);
  };

  const handleUpdateUser = async () => {
    if (!editName.trim() || !editEmail.trim()) {
      Alert.alert("Error", "Name and Email cannot be blank.");
      return;
    }
    setUpdatingUser(true);
    try {
      await updateDoc(doc(db, 'users', editTargetId), {
        name: editName.trim(),
        email: editEmail.trim()
      });
      setEditVisible(false);
    } catch (error: any) {
      Alert.alert("Update Error", error.message);
    } finally {
      setUpdatingUser(false);
    }
  };

  // ---> DELETE USER (BAN) <---
  const handleDeleteUser = (targetUserId: string, userName: string) => {
    Alert.alert(
      "Confirm Hard Deletion",
      `Are you sure you want to completely wipe ${userName} from the database? This will also irrevocably destroy ALL of their chat history with every single user.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Wipe Completely", 
          style: "destructive", 
          onPress: async () => {
            try {
              // 1. Delete user profile
              await deleteDoc(doc(db, 'users', targetUserId));
              
              // 2. Iterate through all possible chats via the memory list to find and eradicate messages
              for (const match of users) {
                 if (match.id === targetUserId) continue;
                 const chatId = [targetUserId, match.id].sort().join('_');
                 const messagesRef = collection(db, 'chats', chatId, 'messages');
                 
                 const msgsSnapshot = await getDocs(messagesRef);
                 for (const msgDoc of msgsSnapshot.docs) {
                    await deleteDoc(msgDoc.ref);
                 }
                 
                 // 3. Sever all explicit contact linkages across the entire database
                 await deleteDoc(doc(db, 'users', match.id, 'friends', targetUserId));
                 await deleteDoc(doc(db, 'users', targetUserId, 'friends', match.id));
              }
              
              Alert.alert("Eradicated", `${userName} and all of their messages have been successfully wiped from Firebase.`);
            } catch (err: any) {
              Alert.alert("Error Wiping Data", err.message);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: UserData }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
        <Text style={styles.userIdText}>ID: {item.id}</Text>
      </View>
      <View style={styles.actionButtons}>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#333'}]} onPress={() => handleOpenEdit(item)}>
          <Text style={styles.actionBtnText}>Edit</Text>
        </TouchableOpacity>
        {item.email !== 'helio@helio.com' && (
          <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#ff4444'}]} onPress={() => handleDeleteUser(item.id, item.name)}>
            <Text style={styles.actionBtnText}>Del</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) {
     return (
       <View style={{...styles.container, justifyContent: 'center'}}>
         <ActivityIndicator size="large" color="#FF9500" />
       </View>
     );
  }

  return (
    <View style={styles.container}>
      
      {/* HEADER BAR */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Registered Users ({users.length})</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setCreateVisible(true)}>
          <Text style={styles.createBtnText}>+ Add New</Text>
        </TouchableOpacity>
      </View>

      {/* USER LIST */}
      <FlatList
        data={users}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
      />

      {/* CREATE USER MODAL */}
      <Modal visible={createVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
             <Text style={styles.modalTitle}>Admin: Create User</Text>
             <TextInput 
               style={styles.modalInput}
               placeholder="Full Name"
               placeholderTextColor="#666"
               value={newUserName}
               onChangeText={setNewUserName}
             />
             <TextInput 
               style={styles.modalInput}
               placeholder="Email Address"
               placeholderTextColor="#666"
               keyboardType="email-address"
               autoCapitalize="none"
               value={newUserEmail}
               onChangeText={setNewUserEmail}
             />
             <TextInput 
               style={styles.modalInput}
               placeholder="Password (Min 6 chars)"
               placeholderTextColor="#666"
               secureTextEntry
               value={newUserPass}
               onChangeText={setNewUserPass}
             />
             <View style={styles.modalButtons}>
               <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#333' }]} onPress={() => setCreateVisible(false)}>
                 <Text style={{color: '#fff', fontWeight: 'bold'}}>Cancel</Text>
               </TouchableOpacity>
               <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#FF9500' }]} onPress={handleCreateUser} disabled={creatingUser}>
                 {creatingUser ? <ActivityIndicator color="#fff"/> : <Text style={{color: '#000', fontWeight: 'bold'}}>Create User</Text>}
               </TouchableOpacity>
             </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EDIT USER MODAL */}
      <Modal visible={editVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
             <Text style={styles.modalTitle}>Update Profile</Text>
             <Text style={styles.modalSubtitle}>Change display name and visible email.</Text>
             <TextInput 
               style={styles.modalInput}
               placeholder="Full Name"
               placeholderTextColor="#666"
               value={editName}
               onChangeText={setEditName}
             />
             <TextInput 
               style={styles.modalInput}
               placeholder="Email Address"
               placeholderTextColor="#666"
               keyboardType="email-address"
               autoCapitalize="none"
               value={editEmail}
               onChangeText={setEditEmail}
             />
             <View style={styles.modalButtons}>
               <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#333' }]} onPress={() => setEditVisible(false)}>
                 <Text style={{color: '#fff', fontWeight: 'bold'}}>Cancel</Text>
               </TouchableOpacity>
               <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#0A84FF' }]} onPress={handleUpdateUser} disabled={updatingUser}>
                 {updatingUser ? <ActivityIndicator color="#fff"/> : <Text style={{color: '#fff', fontWeight: 'bold'}}>Save</Text>}
               </TouchableOpacity>
             </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  createBtn: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createBtnText: {
    color: '#000',
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 16,
  },
  userCard: {
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  userEmail: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
  },
  userIdText: {
    color: '#555',
    fontSize: 10,
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 24,
    width: '100%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 20
  },
  modalInput: {
    backgroundColor: '#2C2C2C',
    color: '#fff',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 16
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center'
  }
});
