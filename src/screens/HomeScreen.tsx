import React, { useEffect, useState, useLayoutEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { collection, onSnapshot, query, where, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { signOut } from 'firebase/auth';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  unreadCount?: number;
}

export default function HomeScreen({ navigation }: Props) {
  const [friends, setFriends] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [addFriendVisible, setAddFriendVisible] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  
  const currentUser = auth.currentUser;
  const isSuperUser = currentUser?.email === 'helio@helio.com';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setAddFriendVisible(true)} style={{ padding: 8, marginRight: 8 }}>
            <Text style={{ color: '#0A84FF', fontSize: 16, fontWeight: 'bold' }}>+ Friend</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signOut(auth)} style={{ padding: 8 }}>
            <Text style={{ color: '#ff4444', fontSize: 16 }}>Logout</Text>
          </TouchableOpacity>
        </View>
      )
    });
  }, [navigation]);

  useEffect(() => {
    if (!currentUser) return;
    
    const friendsRef = collection(db, 'users', currentUser.uid, 'friends');
    
    const unsubscribe = onSnapshot(friendsRef, (snapshot) => {
      const fetchedFriends: UserData[] = [];
      snapshot.forEach(d => {
        fetchedFriends.push(d.data() as UserData);
      });
      setFriends(fetchedFriends);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return unsubscribe;
  }, [currentUser]);

  const handleAddFriend = async () => {
    if (!friendEmail.trim() || !currentUser) return;
    
    const emailToSearch = friendEmail.trim().toLowerCase();
    
    if (emailToSearch === currentUser.email?.toLowerCase()) {
      Alert.alert("Error", "You cannot add yourself.");
      return;
    }

    setAddingFriend(true);
    
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', emailToSearch));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        Alert.alert("Not Found", "No user found with that email address.");
        setAddingFriend(false);
        return;
      }
      
      const friendData = querySnapshot.docs[0].data() as UserData;
      
      await setDoc(doc(db, 'users', currentUser.uid, 'friends', friendData.id), {
        id: friendData.id,
        name: friendData.name,
        email: friendData.email,
        addedAt: Date.now()
      });
      
      const myName = currentUser.displayName || currentUser.email?.split('@')[0] || "Someone";
      await setDoc(doc(db, 'users', friendData.id, 'friends', currentUser.uid), {
        id: currentUser.uid,
        name: myName,
        email: currentUser.email,
        addedAt: Date.now()
      });
      
      setFriendEmail('');
      setAddFriendVisible(false);
      Alert.alert("Success!", `${friendData.name} has been added to your friends.`);
      
    } catch (error: any) {
      Alert.alert("Error adding friend", error.message);
    } finally {
      setAddingFriend(false);
    }
  };

  const handleSuperUserWipe = (targetUserId: string, userName: string) => {
    Alert.alert(
      "Admin: Nuclear Wipe",
      `Are you sure you want to completely eradicate ${userName} from the entire database? This wipes all of their messages globally.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Eradicate",
          style: "destructive",
          onPress: async () => {
             try {
                await deleteDoc(doc(db, 'users', targetUserId));
                
                const allSnapshot = await getDocs(collection(db, 'users'));
                for (const uDoc of allSnapshot.docs) {
                   const matchId = uDoc.id;
                   if (matchId === targetUserId) continue;
                   
                   const chatId = [targetUserId, matchId].sort().join('_');
                   const messagesRef = collection(db, 'chats', chatId, 'messages');
                   const msgsSnapshot = await getDocs(messagesRef);
                   
                   for (const msg of msgsSnapshot.docs) {
                      await deleteDoc(msg.ref);
                   }
                   
                   await deleteDoc(doc(db, 'users', matchId, 'friends', targetUserId));
                   await deleteDoc(doc(db, 'users', targetUserId, 'friends', matchId));
                }
                Alert.alert("Eradicated", `${userName} securely deleted from all records.`);
             } catch (e: any) {
                Alert.alert("Error Wiping Data", e.message);
             }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: UserData }) => (
    <TouchableOpacity 
      style={styles.contactItem}
      onPress={() => navigation.navigate('Chat', { userId: item.id, userName: item.name })}
      onLongPress={() => { if (isSuperUser) handleSuperUserWipe(item.id, item.name); }}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name ? item.name[0].toUpperCase() : '?'}</Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.name}</Text>
        <Text style={styles.lastMessage}>{item.email}</Text>
      </View>
      {!!item.unreadCount && item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
     return (
       <View style={{...styles.container, justifyContent: 'center'}}>
         <ActivityIndicator size="large" color="#0A84FF" />
       </View>
     );
  }

  return (
    <View style={styles.container}>
      {/* ADD FRIEND MODAL */}
      <Modal
        visible={addFriendVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setAddFriendVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
             <Text style={styles.modalTitle}>Add a Friend</Text>
             <TextInput 
               style={styles.modalInput}
               placeholder="Friend's Email"
               placeholderTextColor="#666"
               keyboardType="email-address"
               autoCapitalize="none"
               value={friendEmail}
               onChangeText={setFriendEmail}
             />
             <View style={styles.modalButtons}>
               <TouchableOpacity 
                  style={[styles.modalBtn, { backgroundColor: '#333' }]} 
                  onPress={() => setAddFriendVisible(false)}
               >
                 <Text style={{color: '#fff', fontWeight: 'bold'}}>Cancel</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                 style={[styles.modalBtn, { backgroundColor: '#0A84FF' }]} 
                 onPress={handleAddFriend}
                 disabled={addingFriend}
               >
                 {addingFriend ? <ActivityIndicator color="#fff"/> : <Text style={{color: '#fff', fontWeight: 'bold'}}>Add</Text>}
               </TouchableOpacity>
             </View>
          </View>
        </View>
      </Modal>

      {isSuperUser && (
        <TouchableOpacity style={styles.adminHeroButton} onPress={() => navigation.navigate('AdminDashboard')}>
           <Text style={styles.adminHeroText}>👑 Admin Dashboard (CruD)</Text>
        </TouchableOpacity>
      )}

      {friends.length === 0 ? (
        <View style={styles.emptyContainer}>
           <Text style={styles.emptyText}>Your friends list is empty.</Text>
           <TouchableOpacity style={styles.addHeroButton} onPress={() => setAddFriendVisible(true)}>
              <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 16}}>Add a Friend</Text>
           </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  listContainer: {
    padding: 16,
  },
  adminHeroButton: {
    backgroundColor: '#FF9500',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  adminHeroText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0A84FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  lastMessage: {
    color: '#aaa',
    fontSize: 14,
  },
  unreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    padding: 32
  },
  emptyText: {
    color: '#666',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20
  },
  addHeroButton: {
    backgroundColor: '#0A84FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 8
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
