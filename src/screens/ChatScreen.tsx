import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { db, auth } from '../config/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, getDoc, doc, updateDoc, increment, limit } from 'firebase/firestore';
import { sendPushNotification } from '../utils/pushNotifications';

type ChatScreenProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;

interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: any;
  isRead?: boolean;
}

export default function ChatScreen({ route }: ChatScreenProps) {
  const { userId, userName } = route.params;
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageLimit, setMessageLimit] = useState(25);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const currentUser = auth.currentUser;
  const insets = useSafeAreaInsets();

  const getChatId = () => {
    if (!currentUser) return '';
    return [currentUser.uid, userId].sort().join('_');
  };

  useEffect(() => {
    if (!currentUser) return;
    
    const chatId = getChatId();
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    
    // Request descending order bound precisely by our UI Limit to prevent infinite pulling
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(messageLimit));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages: Message[] = [];
      snapshot.forEach(msgDoc => {
        const data = msgDoc.data() as Message;
        fetchedMessages.push({ ...data, id: msgDoc.id });
        
        if (data.senderId !== currentUser.uid && data.isRead === false) {
            updateDoc(doc(db, 'chats', chatId, 'messages', msgDoc.id), { isRead: true }).catch(() => {});
        }
      });
      
      // Organically reverse back to chronological ASCENDING rendering seamlessly
      fetchedMessages.reverse();
      setMessages(fetchedMessages);
      setIsLoadingMore(false);
    });

    // Reset unread count for this chat to 0 instantly when opened
    updateDoc(doc(db, 'users', currentUser.uid, 'friends', userId), { unreadCount: 0 }).catch(() => {});

    return unsubscribe;
  }, [currentUser, userId, messageLimit]);

  const sendMessage = async () => {
    if (!message.trim() || !currentUser) return;
    
    const chatId = getChatId();
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    
    const textToSend = message;
    setMessage('');

    await addDoc(messagesRef, {
      text: textToSend,
      senderId: currentUser.uid,
      createdAt: serverTimestamp(),
      isRead: false
    });

    // Increment friend's unread counter
    updateDoc(doc(db, 'users', userId, 'friends', currentUser.uid), { unreadCount: increment(1) }).catch(() => {});

    // Send Push Notification
    try {
      const targetUserDoc = await getDoc(doc(db, 'users', userId));
      if (targetUserDoc.exists()) {
         const data = targetUserDoc.data();
         if (data.pushToken) {
            const senderName = currentUser.displayName || currentUser.email?.split('@')[0] || "Someone";
            await sendPushNotification(data.pushToken, `New Message from ${senderName}`, textToSend);
         }
      }
    } catch (e) {
      console.warn("Failed to dispatch push notification: ", e);
    }
  };

  const renderMessage = ({ item, index }: { item: Message, index: number }) => {
    const isMe = item.senderId === currentUser?.uid;
    
    // Firestore serverTimestamp initially resolves as null for optimistic local writes
    const messageDate = item.createdAt ? item.createdAt.toDate() : new Date();
    
    let showDateHeader = false;
    let dateHeaderText = "";

    if (index === 0) {
        showDateHeader = true;
    } else {
        const prevItem = messages[index - 1];
        const prevDate = prevItem.createdAt ? prevItem.createdAt.toDate() : new Date();
        
        if (
            messageDate.getDate() !== prevDate.getDate() ||
            messageDate.getMonth() !== prevDate.getMonth() ||
            messageDate.getFullYear() !== prevDate.getFullYear()
        ) {
            showDateHeader = true;
        }
    }

    if (showDateHeader) {
        const today = new Date();
        const isToday = messageDate.getDate() === today.getDate() &&
                        messageDate.getMonth() === today.getMonth() &&
                        messageDate.getFullYear() === today.getFullYear();
        
        dateHeaderText = isToday ? "Today" : messageDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    const timeString = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View>
        {showDateHeader && (
          <View style={styles.dateHeaderContainer}>
            <Text style={styles.dateHeaderText}>{dateHeaderText}</Text>
          </View>
        )}
        <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
          <Text style={styles.messageText}>{item.text}</Text>
          <Text style={[styles.timeText, isMe ? styles.myTimeText : styles.theirTimeText]}>
            {timeString} {isMe && (item.isRead ? <Text style={{color: '#34B7F1'}}>✓✓</Text> : '✓')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        refreshControl={
          <RefreshControl 
            refreshing={isLoadingMore} 
            onRefresh={() => {
              setIsLoadingMore(true);
              setMessageLimit(prev => prev + 25);
            }} 
            tintColor="#0A84FF"
          />
        }
      />
      
      <View style={[styles.inputContainer, Platform.OS === 'android' && { paddingBottom: Math.max(12, insets.bottom + 12) }]}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          value={message}
          onChangeText={setMessage}
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  dateHeaderContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateHeaderText: {
    color: '#8e8e93',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden'
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 20,
    marginBottom: 8,
    minWidth: 100,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#0A84FF',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#2C2C2C',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myTimeText: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  theirTimeText: {
    color: '#8e8e93',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
    backgroundColor: '#1E1E1E',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  input: {
    flex: 1,
    backgroundColor: '#2C2C2C',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#0A84FF',
    borderRadius: 24,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
