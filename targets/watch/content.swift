import SwiftUI

// MARK: - Models

struct FSUser: Identifiable {
    var id: String
    var name: String
    var email: String
    var unreadCount: Int = 0
}

struct FSMessage: Identifiable {
    var id: String
    var text: String
    var senderId: String
    var isMine: Bool
    var createdAt: Date
    var isRead: Bool = false
}

// MARK: - API Service

class FirestoreService: ObservableObject {
    private var projectId: String {
        return Bundle.main.object(forInfoDictionaryKey: "FIREBASE_PROJECT_ID") as? String ?? "watchoapp-c42af"
    }
    
    private var baseURL: String {
        return "https://firestore.googleapis.com/v1/projects/\(projectId)/databases/(default)/documents"
    }
    
    @Published var allUsers: [FSUser] = []
    @Published var currentUser: FSUser? = nil {
        didSet {
            if currentUser != nil {
                fetchFriends()
            } else {
                users = []
            }
        }
    }
    @Published var users: [FSUser] = []
    @Published var isLoadingFriends: Bool = false
    
    func fetchUsers() {
        guard let url = URL(string: "\(baseURL)/users") else { return }
        
        URLSession.shared.dataTask(with: url) { data, _, error in
            if let error = error {
                print("Network Error: \(error.localizedDescription)")
                return
            }
            guard let data = data else { return }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                   let documents = json["documents"] as? [[String: Any]] {
                    
                    var fetchedUsers: [FSUser] = []
                    
                    for doc in documents {
                        if let fields = doc["fields"] as? [String: Any],
                           let idObj = fields["id"] as? [String: String], let id = idObj["stringValue"],
                           let nameObj = fields["name"] as? [String: String], let name = nameObj["stringValue"],
                           let emailObj = fields["email"] as? [String: String], let email = emailObj["stringValue"] {
                            
                            fetchedUsers.append(FSUser(id: id, name: name, email: email))
                        }
                    }
                    
                    DispatchQueue.main.async {
                        self.allUsers = fetchedUsers
                    }
                }
            } catch {
                print("JSON Parsing Error: \(error)")
            }
        }.resume()
    }
    
    func fetchFriends() {
        guard let myId = currentUser?.id else { return }
        guard let url = URL(string: "\(baseURL)/users/\(myId)/friends") else { return }
        
        DispatchQueue.main.async { self.isLoadingFriends = true }
        
        URLSession.shared.dataTask(with: url) { data, _, error in
            if let error = error {
                print("Network Error: \(error.localizedDescription)")
                DispatchQueue.main.async { self.isLoadingFriends = false }
                return
            }
            guard let data = data else { 
                DispatchQueue.main.async { self.isLoadingFriends = false }
                return 
            }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                    let documents = json["documents"] as? [[String: Any]] ?? []
                    var fetchedFriends: [FSUser] = []
                    
                    for doc in documents {
                        if let fields = doc["fields"] as? [String: Any],
                           let idObj = fields["id"] as? [String: String], let id = idObj["stringValue"],
                           let nameObj = fields["name"] as? [String: String], let name = nameObj["stringValue"],
                           let emailObj = fields["email"] as? [String: String], let email = emailObj["stringValue"] {
                            
                            let unreadCount: Int = {
                                if let unreadObj = fields["unreadCount"] as? [String: Any],
                                   let strVal = unreadObj["integerValue"] as? String { return Int(strVal) ?? 0 }
                                return 0
                            }()
                            fetchedFriends.append(FSUser(id: id, name: name, email: email, unreadCount: unreadCount))
                        }
                    }
                    
                    DispatchQueue.main.async {
                        self.users = fetchedFriends
                        self.isLoadingFriends = false
                    }
                } else { DispatchQueue.main.async { self.isLoadingFriends = false } }
            } catch {
                print("JSON Parsing Error: \(error)")
                DispatchQueue.main.async { self.isLoadingFriends = false }
            }
        }.resume()
    }
    func fetchMessages(targetId: String, limit: Int = 25, completion: @escaping ([FSMessage]) -> Void) {
        guard let myId = currentUser?.id else { return }
        
        // Chat ID is the two UIDs sorted alphabetically
        let chatArr = [myId, targetId].sorted()
        let chatId = "\(chatArr[0])_\(chatArr[1])"
        
        // Zero Unread Count locally
        var resetReq = URLRequest(url: URL(string: "\(baseURL)/users/\(myId)/friends/\(targetId)?updateMask.fieldPaths=unreadCount")!)
        resetReq.httpMethod = "PATCH"
        resetReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let resetPayload: [String: Any] = ["fields": ["unreadCount": ["integerValue": "0"]]]
        resetReq.httpBody = try? JSONSerialization.data(withJSONObject: resetPayload, options: [])
        URLSession.shared.dataTask(with: resetReq).resume()
        
        guard let url = URL(string: "\(baseURL)/chats/\(chatId)/messages?orderBy=createdAt%20desc&pageSize=\(limit)") else { return }
        
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data = data else { return }
            
            do {
                var newMsgs: [FSMessage] = []
                
                if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                   let documents = json["documents"] as? [[String: Any]] {
                    
                    for doc in documents {
                        let pathSegments = (doc["name"] as? String)?.components(separatedBy: "/") ?? []
                        let docId = pathSegments.last ?? UUID().uuidString
                        
                        if let fields = doc["fields"] as? [String: Any],
                           let textObj = fields["text"] as? [String: String], let text = textObj["stringValue"],
                           let senderObj = fields["senderId"] as? [String: String], let senderId = senderObj["stringValue"] {
                            
                            let isRead = (fields["isRead"] as? [String: Bool])?["booleanValue"] ?? false
                            
                            if senderId != myId && !isRead {
                                var patchReq = URLRequest(url: URL(string: "\(self.baseURL)/chats/\(chatId)/messages/\(docId)?updateMask.fieldPaths=isRead")!)
                                patchReq.httpMethod = "PATCH"
                                patchReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
                                let patchPayload: [String: Any] = ["fields": ["isRead": ["booleanValue": true]]]
                                patchReq.httpBody = try? JSONSerialization.data(withJSONObject: patchPayload, options: [])
                                URLSession.shared.dataTask(with: patchReq).resume()
                            }
                            
                            // Parse Timestamp
                            var createdAt = Date()
                            if let timeObj = fields["createdAt"] as? [String: String], let timeStr = timeObj["timestampValue"] {
                                let formatter = ISO8601DateFormatter()
                                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                                if let parsed = formatter.date(from: timeStr) {
                                    createdAt = parsed
                                } else {
                                    let formatterFall = ISO8601DateFormatter()
                                    if let parsedF = formatterFall.date(from: timeStr) { createdAt = parsedF }
                                }
                            }
                            
                            newMsgs.append(FSMessage(id: docId, text: text, senderId: senderId, isMine: senderId == myId, createdAt: createdAt, isRead: isRead))
                        }
                    }
                }
                
                DispatchQueue.main.async {
                    completion(newMsgs.sorted(by: { $0.createdAt < $1.createdAt }))
                }
            } catch { }
        }.resume()
    }
    
    func sendMessage(text: String, targetId: String, completion: @escaping () -> Void) {
        guard let myId = currentUser?.id else { return }
        
        let chatArr = [myId, targetId].sorted()
        let chatId = "\(chatArr[0])_\(chatArr[1])"
        
        guard let url = URL(string: "\(baseURL)/chats/\(chatId)/messages") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let customDateFormatter = ISO8601DateFormatter()
        customDateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let timestamp = customDateFormatter.string(from: Date())
        
        let payload: [String: Any] = [
            "fields": [
                "text": ["stringValue": text],
                "senderId": ["stringValue": myId],
                "createdAt": ["timestampValue": timestamp],
                "isRead": ["booleanValue": false]
            ]
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload, options: [])
        
        URLSession.shared.dataTask(with: request) { _, _, _ in
            DispatchQueue.main.async { completion() }
            
            // Increment Unread Count natively via Commit REST
            guard let commitUrl = URL(string: "\(self.baseURL):commit") else { return }
            var commitReq = URLRequest(url: commitUrl)
            commitReq.httpMethod = "POST"
            commitReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let commitPayload: [String: Any] = [
                "writes": [
                    [
                        "transform": [
                            "document": "projects/\(self.projectId)/databases/(default)/documents/users/\(targetId)/friends/\(myId)",
                            "fieldTransforms": [ [ "fieldPath": "unreadCount", "setToServerValue": "REQUEST_TIME" ] ]
                        ]
                    ]
                ]
            ]
            // We'll fallback to a PATCH to avoid complex FieldTransform nesting syntax issues!
            var patchUR = URLRequest(url: URL(string: "\(self.baseURL)/users/\(targetId)/friends/\(myId)?updateMask.fieldPaths=unreadCount")!)
            patchUR.httpMethod = "PATCH"
            patchUR.setValue("application/json", forHTTPHeaderField: "Content-Type")
            // A simple REST Increment workaround: we trigger an optimistic bump if we can via the React Native receiver
            
            // Wait, we can natively GET and PATCH:
            URLSession.shared.dataTask(with: URL(string: "\(self.baseURL)/users/\(targetId)/friends/\(myId)")!) { d,_,_ in
                if let d=d, let js=try? JSONSerialization.jsonObject(with: d) as? [String:Any], let f=js["fields"] as? [String:Any] {
                    var oldV = 0
                    if let uc=f["unreadCount"] as? [String:Any], let st=uc["integerValue"] as? String { oldV = Int(st) ?? 0 }
                    let nextP: [String:Any] = ["fields": ["unreadCount": ["integerValue": "\(oldV + 1)"]]]
                    var pu = URLRequest(url: URL(string: "\(self.baseURL)/users/\(targetId)/friends/\(myId)?updateMask.fieldPaths=unreadCount")!)
                    pu.httpMethod = "PATCH"; pu.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    pu.httpBody = try? JSONSerialization.data(withJSONObject: nextP)
                    URLSession.shared.dataTask(with: pu).resume()
                }
            }.resume()
            
            // Fire Push Notification to Target User
            guard let userUrl = URL(string: "\(self.baseURL)/users/\(targetId)") else { return }
            URLSession.shared.dataTask(with: userUrl) { data, _, _ in
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                      let fields = json["fields"] as? [String: Any],
                      let tokenObj = fields["pushToken"] as? [String: String],
                      let pushToken = tokenObj["stringValue"] else { return }
                      
                let senderName = self.currentUser?.name ?? "Someone"
                let pushPayload: [String: Any] = [
                    "to": pushToken,
                    "title": "New Message from \(senderName) ⌚️",
                    "body": text,
                    "sound": "default"
                ]
                
                guard let pushUrl = URL(string: "https://exp.host/--/api/v2/push/send") else { return }
                var pushReq = URLRequest(url: pushUrl)
                pushReq.httpMethod = "POST"
                pushReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
                pushReq.httpBody = try? JSONSerialization.data(withJSONObject: pushPayload, options: [])
                URLSession.shared.dataTask(with: pushReq).resume()
                
            }.resume()
            
        }.resume()
    }
}

// MARK: - Views

struct ContentView: View {
    @StateObject var firestore = FirestoreService()
    
    var body: some View {
        Group {
            if firestore.currentUser == nil {
                SelectUserView(firestore: firestore)
            } else {
                ContactsView(firestore: firestore)
            }
        }
        .onAppear {
            firestore.fetchUsers()
        }
    }
}

struct SelectUserView: View {
    @ObservedObject var firestore: FirestoreService
    
    var body: some View {
        NavigationView {
            Group {
                if firestore.allUsers.isEmpty {
                    VStack {
                        ProgressView()
                        Text("Loading Users...")
                            .font(.footnote)
                            .foregroundColor(.gray)
                            .padding(.top, 4)
                    }
                } else {
                    List(firestore.allUsers) { user in
                        Button(action: {
                            firestore.currentUser = user
                        }) {
                            HStack {
                                ZStack {
                                    Circle().fill(Color.orange).frame(width: 32, height: 32)
                                    Text(String(user.name.prefix(1)))
                                        .foregroundColor(.white)
                                        .font(.system(size: 14, weight: .bold))
                                }
                                VStack(alignment: .leading) {
                                    Text(user.name).font(.headline)
                                    Text(user.email).font(.footnote).foregroundColor(.gray)
                                }
                                .padding(.leading, 8)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(CarouselListStyle())
                    .refreshable {
                        firestore.fetchUsers()
                        try? await Task.sleep(nanoseconds: 750_000_000)
                    }
                }
            }
            .navigationTitle("Who are you?")
        }
    }
}

struct ContactsView: View {
    @ObservedObject var firestore: FirestoreService
    
    var body: some View {
        NavigationView {
            Group {
                if firestore.isLoadingFriends && firestore.users.isEmpty {
                    VStack {
                        ProgressView()
                        Text("Loading Contacts...")
                            .font(.footnote)
                            .foregroundColor(.gray)
                            .padding(.top, 4)
                    }
                } else if firestore.users.isEmpty {
                    Text("No Contacts")
                        .font(.headline)
                } else {
                    List(firestore.users) { user in
                        NavigationLink(destination: ChatView(firestore: firestore, targetUser: user)) {
                            HStack {
                                ZStack {
                                    Circle().fill(user.unreadCount > 0 ? Color.red : Color.blue).frame(width: 32, height: 32)
                                    Text(String(user.name.prefix(1)))
                                        .foregroundColor(.white)
                                        .font(.system(size: 14, weight: .bold))
                                }
                                VStack(alignment: .leading) {
                                    Text(user.name).font(.headline).foregroundColor(user.unreadCount > 0 ? Color.red : Color.primary)
                                    Text(user.email).font(.footnote).foregroundColor(user.unreadCount > 0 ? Color(white: 0.8) : .gray)
                                }
                                .padding(.leading, 8)
                                
                                Spacer()
                                if user.unreadCount > 0 {
                                    Text("\(user.unreadCount)")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.red)
                                        .clipShape(Capsule())
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(CarouselListStyle())
                    .refreshable {
                        firestore.fetchFriends()
                        try? await Task.sleep(nanoseconds: 750_000_000)
                    }
                }
            }
            .navigationTitle("Contacts")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: {
                        firestore.currentUser = nil
                    }) {
                        Text("Log Out")
                            .foregroundColor(.red)
                    }
                }
            }
        }
    }
}

struct ChatView: View {
    @ObservedObject var firestore: FirestoreService
    var targetUser: FSUser
    
    @State private var messages: [FSMessage] = []
    @State private var newMessageText: String = ""
    @State private var timer: Timer?
    @State private var isLoading: Bool = true
    @State private var messageLimit: Int = 25

    var body: some View {
        VStack {
            ScrollViewReader { proxy in
                List {
                    if isLoading {
                        ProgressView()
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .center)
                            .listRowBackground(Color.clear)
                    } else {
                        if messages.count >= messageLimit {
                            Button("Load Older Messages") {
                                isLoading = true
                                messageLimit += 25
                                refreshMessages()
                            }
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.blue)
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .listRowBackground(Color.clear)
                        }
                        
                        if messages.isEmpty {
                            Text("No messages yet")
                                .font(.footnote)
                                .foregroundColor(.gray)
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .center)
                                .listRowBackground(Color.clear)
                        }
                    }
                    
                    ForEach(Array(messages.enumerated()), id: \.element.id) { index, msg in
                        let prevMsg = index == 0 ? nil : messages[index - 1]
                        let showHeader = prevMsg == nil ? true : !Calendar.current.isDate(msg.createdAt, inSameDayAs: prevMsg!.createdAt)
                        let showUnreadHeader = (!msg.isMine && !msg.isRead) && (prevMsg == nil || prevMsg!.isMine || prevMsg!.isRead)
                        
                        MessageCell(msg: msg, showDateHeader: showHeader, showUnreadHeader: showUnreadHeader)
                            .id(msg.id)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 2, leading: 0, bottom: 2, trailing: 0))
                    }
                }
                .listStyle(PlainListStyle())
                .refreshable {
                    refreshMessages()
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                }
                .onChange(of: messages.count) { _ in
                    if let last = messages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }
            
            HStack {
                TextField("Reply...", text: $newMessageText)
                    .font(.system(size: 15))
                Button(action: sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .resizable()
                        .frame(width: 28, height: 28)
                        .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 4)
        }
        .navigationTitle(targetUser.name)
        .onAppear {
            refreshMessages()
            timer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { _ in
                refreshMessages()
            }
        }
        .onDisappear {
            timer?.invalidate()
        }
    }
    
    func refreshMessages() {
        firestore.fetchMessages(targetId: targetUser.id, limit: messageLimit) { msgs in
            self.messages = msgs
            self.isLoading = false
        }
    }
    
    func sendMessage() {
        guard !newMessageText.isEmpty else { return }
        let textToSend = newMessageText
        newMessageText = ""
        
        let optimisticMsg = FSMessage(id: UUID().uuidString, text: textToSend, senderId: "mine", isMine: true, createdAt: Date())
        messages.append(optimisticMsg)
        
        firestore.sendMessage(text: textToSend, targetId: targetUser.id) {
            refreshMessages()
        }
    }
}

struct MessageCell: View {
    var msg: FSMessage
    var showDateHeader: Bool
    var showUnreadHeader: Bool = false
    
    var dateString: String {
        let cal = Calendar.current
        if cal.isDateInToday(msg.createdAt) { return "Today" }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: msg.createdAt)
    }
    
    var timeString: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: msg.createdAt)
    }
    
    var body: some View {
        VStack(alignment: .center, spacing: 6) {
            if showDateHeader {
                Text(dateString)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(white: 0.6))
                    .padding(.vertical, 4)
            }
            
            if showUnreadHeader {
                Text("UNREAD MESSAGES")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.red)
                    .clipShape(Capsule())
                    .padding(.vertical, 2)
            }
            
            HStack(alignment: .bottom) {
                if msg.isMine { Spacer() }
                
                VStack(alignment: msg.isMine ? .trailing : .leading, spacing: 2) {
                    Text(msg.text)
                        .foregroundColor(.white)
                        .font(.system(size: 15))
                        
                    HStack(spacing: 4) {
                        Text(timeString)
                            .font(.system(size: 9))
                            .foregroundColor(msg.isMine ? Color(white: 0.8) : Color(white: 0.6))
                        
                        if msg.isMine {
                            Text(msg.isRead ? "✓✓" : "✓")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(msg.isRead ? Color(red: 0.2, green: 0.8, blue: 1.0) : Color(white: 0.8))
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(msg.isMine ? Color.blue : Color(white: 0.2))
                .cornerRadius(12)
                
                if !msg.isMine { Spacer() }
            }
        }
    }
}
