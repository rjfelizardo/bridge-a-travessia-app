import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Alert, Dimensions,
  FlatList, Modal, KeyboardAvoidingView, Platform, Image,
  Animated, Linking, Switch, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const DAILY_REMINDER_ID = 'bridge-daily-reminder';

// Agenda (ou cancela) o lembrete diário local de estudo.
async function syncDailyReminder(enabled) {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Lembretes Bridge',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    if (!enabled) {
      await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
      return;
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return false; // usuária negou permissão
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REMINDER_ID,
      content: { title: 'Bridge — A Travessia 🌿', body: 'Que tal continuar sua travessia hoje? Uma aula já é um passo.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 19, minute: 0 },
    });
    return true;
  } catch (e) {
    return false;
  }
}

const { width } = Dimensions.get('window');

const SUPA_URL = 'https://mlkhoibaqnvpkhziaidx.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sa2hvaWJhcW52cGtoemlhaWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTEyMTUsImV4cCI6MjA5NjY2NzIxNX0.ptiXoaV30WPgP9wulGPITht-3S4HHuQY8lWhWaU6Fn8';
let _accessToken = null;

const supabase = {
  auth: {
    signUp: async ({ email, password }) => {
      const r = await fetch(`${SUPA_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (data.access_token) _accessToken = data.access_token;
      return r.ok ? { data: { user: data.user ?? data }, error: null }
                  : { data: null, error: { message: data.msg || data.error_description || 'Erro' } };
    },
    signInWithPassword: async ({ email, password }) => {
      const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (data.access_token) _accessToken = data.access_token;
      return r.ok ? { data: { user: data.user, session: data }, error: null }
                  : { data: null, error: { message: data.error_description || 'Erro' } };
    },
  },
  from: (table) => ({
    insert: async (rows) => {
      const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${_accessToken || SUPA_KEY}`, Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      });
      return r.ok ? { error: null } : { error: { message: await r.text() } };
    },
    upsert: async (row) => {
      const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${_accessToken || SUPA_KEY}`, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
      return r.ok ? { error: null } : { error: { message: await r.text() } };
    },
    select: (cols) => ({
      eq: (col, val) => ({
        single: async () => {
          const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${cols}&${col}=eq.${val}&limit=1`, {
            headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_accessToken || SUPA_KEY}`, Accept: 'application/vnd.pgrst.object+json' },
          });
          const data = await r.json();
          return r.ok ? { data, error: null } : { data: null, error: { message: data.message } };
        },
      }),
      ilike: (col, val) => ({
        limit: (n) => ({
          maybeSingle: async () => {
            const enc = encodeURIComponent(val);
            const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${cols}&${col}=ilike.${enc}&limit=${n}`, {
              headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_accessToken || SUPA_KEY}`, Accept: 'application/vnd.pgrst.object+json' },
            });
            const data = await r.json();
            return r.ok ? { data, error: null } : { data: null, error: null };
          },
        }),
      }),
    }),
  }),
};

const C = {
  navy: '#1E2D3D', navy2: '#2C4158', sand: '#C8B89A', sand2: '#E8DDD0',
  cream: '#F5F0E8', white: '#FDFCFA', text: '#2A2A2A', muted: '#7A7068',
  green: '#7cb99a', red: '#e07070', gold: '#D4A843', purple: '#7C3AED',
};

const HOME_BG = 'https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/images/home_bg.jpg?t=2';

const TRAIL_COLORS = {
  '1': { color: '#1E2D3D', accent: '#2C4158', bg: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=900&q=85' },
  '2': { color: '#1E2D3D', accent: '#2C4158', bg: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=85' },
  '3': { color: '#1E2D3D', accent: '#2C4158', bg: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=900&q=85' },
  '4': { color: '#1E2D3D', accent: '#2C4158', bg: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=85' },
  '5': { color: '#1E2D3D', accent: '#2C4158', bg: 'https://images.unsplash.com/photo-1531685250784-7569952593d2?w=900&q=85' },
};

const TRAILS = [
  { id: '1', num: 1, name: 'Diagnosticar', icon: '🔍', desc: 'Entenda onde você está e o que está pesando mais na sua vida.', lessons: 4, free: true },
  { id: '2', num: 2, name: 'Organizar',    icon: '📦', desc: 'Crie estrutura, clareza e direção para o lar e a rotina.',    lessons: 6, free: true },
  { id: '3', num: 3, name: 'Simplificar',  icon: '✂️', desc: 'Elimine excessos físicos e mentais que drenam energia.',       lessons: 5, free: true },
  { id: '4', num: 4, name: 'Sustentar',    icon: '🌱', desc: 'Construa hábitos duradouros que se mantêm sozinhos.',          lessons: 5, free: true },
  { id: '5', num: 5, name: 'Florescer',    icon: '🌸', desc: 'Viva com leveza, intenção e presença plena.',                 lessons: 4, free: true },
];

const POSTS = [
  { id: '1', name: 'Ana Clara',  avatar: '🌿', time: '2h', text: 'Terminei a primeira trilha hoje! Que sensação incrível de leveza. Obrigada Bridge 💛', likes: 14 },
  { id: '2', name: 'Mariana S.', avatar: '🌸', time: '5h', text: 'Dica: comece pelo quarto. É o espaço que você vê primeiro e último todo dia.', likes: 28 },
  { id: '3', name: 'Juliana R.', avatar: '🌻', time: '1d', text: 'Semana 3 na trilha Organizar. Minha cozinha nunca esteve tão funcional!', likes: 19 },
];

const MENTORS = [
  { id: '1', name: 'Jessica Suzart', photo: 'https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/images/Jessica.jpg', specialty: 'Mentora de Organização & Bem-estar', rating: 5.0, sessions: 87, bio: 'Formada em Turismo e em formação em Psicanálise, Jessica une sensibilidade e escuta ativa para acompanhar mulheres que desejam transformar sua rotina. Na Bridge, ela ajuda a identificar os bloqueios emocionais que dificultam a organização da casa e da vida, guiando cada usuária com acolhimento e clareza.' },
  { id: '2', name: 'Dra. Francis Reis', photo: 'https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/images/Francis.png', specialty: 'Mentora de Organização & Bem-estar', rating: 5.0, sessions: 112, bio: 'Fonoaudióloga e Psicopedagoga (CRFa 2752-5), a Dra. Francis tem vasta experiência em comunicação, cognição e desenvolvimento humano. Na Bridge, ela atua identificando as questões emocionais e cognitivas que impedem a mulher de manter uma rotina organizada, oferecendo um acompanhamento humanizado e transformador.' },
];

// ═══════════════════════════════════════
// COMPONENTES DE AULA RICA
// ═══════════════════════════════════════

function SectionDivider({ title }) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', marginHorizontal:24, marginVertical:24, gap:10 }}>
      <View style={{ flex:1, height:1, backgroundColor:C.sand2 }} />
      {title && <Text style={{ fontSize:10, color:C.muted, fontWeight:'700', letterSpacing:1.5, textTransform:'uppercase', flexShrink:0 }}>{title}</Text>}
      {title && <View style={{ flex:1, height:1, backgroundColor:C.sand2 }} />}
    </View>
  );
}

function AccordionItem({ title, description, index }) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const toggle = () => {
    Animated.spring(anim, { toValue: open ? 0 : 1, useNativeDriver: false, tension: 80, friction: 10 }).start();
    setOpen(!open);
  };
  const rotate = anim.interpolate({ inputRange:[0,1], outputRange:['0deg','180deg'] });
  return (
    <View style={{ marginHorizontal:20, marginBottom:8, backgroundColor:'#fff', borderRadius:14, overflow:'hidden', borderWidth:1, borderColor:C.sand2 }}>
      <TouchableOpacity style={{ flexDirection:'row', alignItems:'center', padding:16, gap:12 }} onPress={toggle} activeOpacity={0.8}>
        <View style={{ width:28, height:28, borderRadius:14, backgroundColor:C.navy, alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Text style={{ color:'#fff', fontSize:12, fontWeight:'800' }}>{index+1}</Text>
        </View>
        <Text style={{ flex:1, fontSize:14, fontWeight:'700', color:C.navy, lineHeight:20 }}>{title}</Text>
        <Animated.Text style={{ fontSize:18, color:C.sand, fontWeight:'700', transform:[{rotate}] }}>▾</Animated.Text>
      </TouchableOpacity>
      {open && <View style={{ paddingHorizontal:20, paddingBottom:18, paddingTop:4, borderTopWidth:1, borderTopColor:C.sand2 }}><Text style={{ fontSize:14, color:C.text, lineHeight:22 }}>{description}</Text></View>}
    </View>
  );
}

function Flashcard({ front, back, audioTranscript, index, total }) {
  const [flipped, setFlipped] = useState(false);
  const [showT, setShowT] = useState(false);
  const [frontH, setFrontH] = useState(0);
  const [backH, setBackH] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const flip = () => {
    Animated.spring(anim, { toValue: flipped ? 0 : 1, useNativeDriver: true, tension:60, friction:8 }).start();
    setFlipped(!flipped); setShowT(false);
  };
  const fR = anim.interpolate({ inputRange:[0,1], outputRange:['0deg','180deg'] });
  const bR = anim.interpolate({ inputRange:[0,1], outputRange:['180deg','360deg'] });
  const cardHeight = Math.max(160, frontH, backH);
  return (
    <View style={{ marginHorizontal:20, marginBottom:8 }}>
      <Text style={{ textAlign:'center', fontSize:11, color:C.muted, fontWeight:'600', marginBottom:10, letterSpacing:1 }}>{index+1} de {total}</Text>
      <TouchableOpacity onPress={flip} activeOpacity={0.95} style={{ height: cardHeight }}>
        <Animated.View
          onLayout={(e) => { const h = e.nativeEvent.layout.height; if (Math.abs(h - frontH) > 1) setFrontH(h); }}
          style={{ minHeight:160, width:'100%', borderRadius:16, paddingVertical:22, paddingHorizontal:24, justifyContent:'space-between', alignItems:'center', backgroundColor:C.navy, transform:[{rotateY:fR}], backfaceVisibility:'hidden', position:'absolute', top:0, left:0, right:0 }}
        >
          <Text style={{ fontSize:10, fontWeight:'800', letterSpacing:2, color:'rgba(255,255,255,0.5)' }}>PERGUNTA</Text>
          <Text style={{ fontSize:17, color:'#fff', fontWeight:'600', textAlign:'center', lineHeight:26, marginVertical:14 }}>{front}</Text>
          <Text style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontStyle:'italic' }}>Toque para ver a resposta →</Text>
        </Animated.View>
        <Animated.View
          onLayout={(e) => { const h = e.nativeEvent.layout.height; if (Math.abs(h - backH) > 1) setBackH(h); }}
          style={{ minHeight:160, width:'100%', borderRadius:16, paddingVertical:22, paddingHorizontal:24, justifyContent:'space-between', alignItems:'center', backgroundColor:'#7C3AED', transform:[{rotateY:bR}], backfaceVisibility:'hidden', position:'absolute', top:0, left:0, right:0 }}
        >
          <Text style={{ fontSize:10, fontWeight:'800', letterSpacing:2, color:'rgba(255,255,255,0.5)' }}>RESPOSTA</Text>
          <Text style={{ fontSize:15, color:'#fff', textAlign:'center', lineHeight:24, marginVertical:14 }}>{back}</Text>
          <Text style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontStyle:'italic' }}>Toque para voltar ←</Text>
        </Animated.View>
      </TouchableOpacity>
      {audioTranscript && (
        <View style={{ backgroundColor:C.sand2, borderRadius:12, padding:14, marginTop:10 }}>
          <TouchableOpacity onPress={()=>setShowT(!showT)} style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <Text>🎙️</Text>
            <Text style={{ fontSize:13, color:C.navy, fontWeight:'600' }}>{showT ? 'Ocultar reflexão' : 'Ver reflexão em áudio'}</Text>
          </TouchableOpacity>
          {showT && <Text style={{ fontSize:13, color:C.text, lineHeight:20, marginTop:10, fontStyle:'italic' }}>{audioTranscript}</Text>}
        </View>
      )}
    </View>
  );
}

function LessonQuiz({ question, answers, questionIndex, total }) {
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  return (
    <View style={{ backgroundColor:'#fff', marginHorizontal:20, borderRadius:16, padding:20, marginBottom:20, borderWidth:1, borderColor:C.sand2 }}>
      <Text style={{ fontSize:10, fontWeight:'800', color:'#7C3AED', letterSpacing:1.5, textTransform:'uppercase', marginBottom:14 }}>📝 QUIZ {questionIndex}/{total}</Text>
      <Text style={{ fontSize:15, fontWeight:'700', color:C.navy, lineHeight:22, marginBottom:16 }}>{question}</Text>
      {answers.map((a,i) => {
        let bg = C.cream, border = C.sand2, tc = C.text;
        if (answered) {
          if (a.correct) { bg='#ECFDF5'; border='#7cb99a'; tc='#065f46'; }
          else if (selected===a) { bg='#FEF2F2'; border='#ef4444'; tc='#991b1b'; }
          else { bg=C.cream; border=C.sand2; }
        }
        return (
          <TouchableOpacity key={i} style={{ backgroundColor:bg, borderRadius:12, padding:14, marginBottom:8, borderWidth:1.5, borderColor:border, opacity: answered && !a.correct && selected!==a ? 0.5 : 1 }}
            onPress={() => { if (!answered) { setSelected(a); setAnswered(true); } }} activeOpacity={0.8}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
              <View style={{ width:26, height:26, borderRadius:13, backgroundColor:C.navy, alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Text style={{ color:'#fff', fontSize:12, fontWeight:'800' }}>{String.fromCharCode(65+i)}</Text>
              </View>
              <Text style={{ fontSize:14, color:tc, lineHeight:20, flex:1, fontWeight: answered && a.correct ? '600' : '400' }}>{a.title}</Text>
              {answered && a.correct && <Text>✓</Text>}
              {answered && selected===a && !a.correct && <Text>✗</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
      {answered && selected && (
        <View style={{ borderRadius:12, padding:14, marginTop:8, flexDirection:'row', gap:10, alignItems:'flex-start', backgroundColor: selected.correct ? '#ECFDF5' : '#FEF9C3' }}>
          <Text style={{ fontSize:18 }}>{selected.correct ? '🎉' : '💡'}</Text>
          <Text style={{ fontSize:13, color:C.text, lineHeight:20, flex:1 }}>{selected.feedback}</Text>
        </View>
      )}
      {answered && (
        <TouchableOpacity style={{ alignSelf:'center', marginTop:14, paddingHorizontal:20, paddingVertical:8, borderRadius:20, borderWidth:1.5, borderColor:C.sand }}
          onPress={() => { setSelected(null); setAnswered(false); }}>
          <Text style={{ fontSize:13, color:C.muted, fontWeight:'600' }}>Tentar novamente</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StepByStep({ intro, steps, summary }) {
  const [cur, setCur] = useState(-1);
  const [done, setDone] = useState(false);
  const isIntro = cur === -1;
  const step = steps[cur];
  const isLast = cur === steps.length - 1;
  const next = () => { if (isLast) setDone(true); else setCur(cur+1); };
  const prev = () => { if (cur===0) setCur(-1); else setCur(cur-1); };
  return (
    <View style={{ backgroundColor:'#fff', marginHorizontal:20, borderRadius:16, padding:24, marginBottom:20, borderWidth:1, borderColor:C.sand2 }}>
      {!isIntro && !done && (
        <View style={{ flexDirection:'row', gap:6, marginBottom:20, justifyContent:'center' }}>
          {steps.map((_,i) => <View key={i} style={{ width: i===cur?24:10, height:10, borderRadius:5, backgroundColor: i<cur?C.green:i===cur?C.navy:C.sand2 }} />)}
        </View>
      )}
      <View style={{ alignItems:'center' }}>
        {isIntro && !done && (<>
          <Text style={{ fontSize:40, marginBottom:16 }}>🔍</Text>
          <Text style={{ fontSize:17, fontWeight:'800', color:C.navy, textAlign:'center', marginBottom:12, lineHeight:24 }}>{intro.title}</Text>
          <Text style={{ fontSize:14, color:C.text, textAlign:'center', lineHeight:22, marginBottom:24 }}>{intro.description}</Text>
          <TouchableOpacity style={{ backgroundColor:C.navy, paddingHorizontal:28, paddingVertical:14, borderRadius:50 }} onPress={()=>setCur(0)}>
            <Text style={{ color:'#fff', fontWeight:'800', fontSize:13, letterSpacing:1 }}>INICIAR EXERCÍCIO →</Text>
          </TouchableOpacity>
        </>)}
        {!isIntro && !done && step && (<>
          <View style={{ backgroundColor:C.navy, paddingHorizontal:12, paddingVertical:4, borderRadius:20, marginBottom:14 }}>
            <Text style={{ color:C.sand, fontSize:11, fontWeight:'700', letterSpacing:1 }}>Passo {cur+1} de {steps.length}</Text>
          </View>
          <Text style={{ fontSize:17, fontWeight:'800', color:C.navy, textAlign:'center', marginBottom:12, lineHeight:24 }}>{step.title}</Text>
          <Text style={{ fontSize:14, color:C.text, textAlign:'center', lineHeight:22, marginBottom:24 }}>{step.description}</Text>
          <View style={{ flexDirection:'row', gap:12, alignItems:'center' }}>
            <TouchableOpacity style={{ paddingHorizontal:16, paddingVertical:14, borderRadius:50, borderWidth:1.5, borderColor:C.sand2 }} onPress={prev}>
              <Text style={{ color:C.muted, fontWeight:'600', fontSize:13 }}>← Anterior</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor:C.navy, paddingHorizontal:28, paddingVertical:14, borderRadius:50 }} onPress={next}>
              <Text style={{ color:'#fff', fontWeight:'800', fontSize:13, letterSpacing:1 }}>{isLast ? 'CONCLUIR ✓' : 'PRÓXIMO →'}</Text>
            </TouchableOpacity>
          </View>
        </>)}
        {done && (<>
          <Text style={{ fontSize:40, marginBottom:16 }}>🌿</Text>
          <Text style={{ fontSize:17, fontWeight:'800', color:C.navy, textAlign:'center', marginBottom:12, lineHeight:24 }}>{summary.title}</Text>
          <Text style={{ fontSize:14, color:C.text, textAlign:'center', lineHeight:22, marginBottom:24 }}>{summary.description}</Text>
          <TouchableOpacity style={{ paddingHorizontal:20, paddingVertical:10, borderRadius:20, borderWidth:1.5, borderColor:C.sand }} onPress={()=>{setCur(-1);setDone(false);}}>
            <Text style={{ color:C.muted, fontSize:13, fontWeight:'600' }}>Refazer exercício</Text>
          </TouchableOpacity>
        </>)}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════
const slides = [
  { id: '1', imgUrl: 'https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/images/onboarding_1.jpg?t=2', title: 'Do caos à leveza', sub: 'Bridge é a ponte entre a sobrecarga que você sente hoje e a vida organizada e leve que você merece.' },
  { id: '2', imgUrl: 'https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/images/onboarding_2.jpg?t=2', title: 'Um método completo', sub: 'Cinco etapas guiadas — no seu ritmo — para transformar sua casa e sua rotina de dentro para fora.' },
  { id: '3', imgUrl: 'https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/images/onboarding_3.jpg?t=2', title: 'Você não está sozinha', sub: 'Comunidade, mentorias e conteúdo especializado para cada passo da sua travessia.' },
];

function OnboardingScreen({ onFinish }) {
  const [cur, setCur] = useState(0);
  const next = () => cur < slides.length - 1 ? setCur(cur+1) : onFinish();
  const s = slides[cur];
  const content = (
    <View style={ob.inner}>
      <Text style={ob.title}>{s.title}</Text>
      <Text style={ob.sub}>{s.sub}</Text>
      <View style={ob.dots}>{slides.map((_,i) => <View key={i} style={[ob.dot, i===cur&&ob.dotActive]} />)}</View>
      <TouchableOpacity style={ob.btn} onPress={next}><Text style={ob.btnText}>{cur<slides.length-1?'Continuar →':'Começar'}</Text></TouchableOpacity>
      {cur<slides.length-1 && <TouchableOpacity onPress={onFinish}><Text style={ob.skip}>Pular</Text></TouchableOpacity>}
    </View>
  );
  return (
    <View style={ob.container}>
      <Image source={{ uri: s.imgUrl }} style={ob.bgImage} resizeMode="cover" />
      <View style={ob.overlay} />
      {content}
    </View>
  );
}
const ob = StyleSheet.create({
  container: { flex:1, backgroundColor:C.navy },
  bgImage:   { position:'absolute', top:0, left:0, right:0, bottom:0, width:'100%', height:'100%' },
  overlay:   { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(10,20,35,0.62)' },
  inner:     { flex:1, alignItems:'center', justifyContent:'center', padding:40 },
  title:     { fontSize:30, color:'#fff', fontWeight:'300', textAlign:'center', marginBottom:16 },
  sub:       { fontSize:15, color:'rgba(255,255,255,.6)', textAlign:'center', lineHeight:24, marginBottom:48 },
  dots:      { flexDirection:'row', gap:8, marginBottom:40 },
  dot:       { width:8, height:8, borderRadius:4, backgroundColor:'rgba(255,255,255,.25)' },
  dotActive: { backgroundColor:C.sand, width:24 },
  btn:       { backgroundColor:C.sand, paddingHorizontal:40, paddingVertical:16, borderRadius:50, marginBottom:20 },
  btnText:   { color:C.navy, fontWeight:'700', fontSize:15 },
  skip:      { color:'rgba(255,255,255,.4)', fontSize:14 },
});

// ═══════════════════════════════════════
// AUTH
// ═══════════════════════════════════════
function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    if (tab==='signup' && !name) return Alert.alert('Preencha seu nome.');
    if (!email || !pass) return Alert.alert('Preencha e-mail e senha.');
    setLoading(true);
    if (tab==='signup') {
      const { data, error } = await supabase.auth.signUp({ email, password: pass });
      if (error) { setLoading(false); return Alert.alert('Erro ao cadastrar', error.message); }
      const userId = data.user?.id;
      if (userId) await supabase.from('users').insert({ id: userId, email, full_name: name });
      setLoading(false);
      onLogin({ id: userId, name: name||'Usuária', email });
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) { setLoading(false); return Alert.alert('Erro ao entrar', error.message||'Verifique seu e-mail e senha.'); }
      const userId = data.user?.id;
      let { data: profile } = await supabase.from('users').select('full_name').eq('id', userId).single();
      if (!profile) {
        const n = email.split('@')[0];
        await supabase.from('users').insert({ id: userId, email, full_name: n });
        profile = { full_name: n };
      }
      setLoading(false);
      onLogin({ id: userId, name: profile?.full_name||'Usuária', email });
    }
  };
  return (
    <KeyboardAvoidingView style={au.container} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView contentContainerStyle={au.inner} keyboardShouldPersistTaps="handled">
        <Text style={au.logo}>BRIDGE.</Text>
        <View style={au.tabs}>
          <TouchableOpacity style={[au.tab, tab==='signup'&&au.tabActive]} onPress={()=>setTab('signup')}><Text style={[au.tabText, tab==='signup'&&au.tabTextActive]}>Cadastrar</Text></TouchableOpacity>
          <TouchableOpacity style={[au.tab, tab==='login'&&au.tabActive]} onPress={()=>setTab('login')}><Text style={[au.tabText, tab==='login'&&au.tabTextActive]}>Entrar</Text></TouchableOpacity>
        </View>
        {tab==='signup' && <TextInput style={au.input} placeholder="Nome completo" placeholderTextColor="#999" value={name} onChangeText={setName} autoCapitalize="words" />}
        <TextInput style={au.input} placeholder="E-mail" placeholderTextColor="#999" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <View style={au.passRow}>
          <TextInput style={au.passInput} placeholder="Senha" placeholderTextColor="#999" value={pass} onChangeText={setPass} secureTextEntry={!showPass} />
          <TouchableOpacity onPress={()=>setShowPass(s=>!s)} style={au.passToggle} hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
            <Text style={au.passToggleText}>{showPass ? 'Ocultar' : 'Mostrar'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={au.btn} onPress={handle} disabled={loading}><Text style={au.btnText}>{loading?'Aguarde...':(tab==='signup'?'Iniciar Minha Travessia':'Entrar')}</Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const au = StyleSheet.create({
  container: { flex:1, backgroundColor:C.cream },
  inner:     { padding:32, paddingTop:80 },
  logo:      { fontSize:22, fontWeight:'700', letterSpacing:4, color:C.navy, marginBottom:40 },
  tabs:      { flexDirection:'row', backgroundColor:'#E8DDD0', borderRadius:50, padding:4, marginBottom:28 },
  tab:       { flex:1, padding:12, borderRadius:50, alignItems:'center' },
  tabActive: { backgroundColor:C.navy },
  tabText:   { fontSize:13, fontWeight:'600', color:C.muted, textTransform:'uppercase', letterSpacing:1 },
  tabTextActive: { color:'#fff' },
  input:     { backgroundColor:'#fff', borderRadius:14, padding:16, fontSize:15, color:C.text, borderWidth:1.5, borderColor:C.sand2, marginBottom:14 },
  passRow:   { flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:14, borderWidth:1.5, borderColor:C.sand2, marginBottom:14, paddingRight:6 },
  passInput: { flex:1, padding:16, fontSize:15, color:C.text },
  passToggle:{ paddingHorizontal:12, paddingVertical:8 },
  passToggleText: { color:C.navy, fontSize:13, fontWeight:'700' },
  btn:       { backgroundColor:C.navy, padding:18, borderRadius:50, alignItems:'center', marginTop:8 },
  btnText:   { color:'#fff', fontWeight:'700', fontSize:15 },
});

// ═══════════════════════════════════════
// DIAGNÓSTICO
// ═══════════════════════════════════════
const questions = [
  { id:'q1', text:'Como você descreveria o estado da sua casa hoje?', opts:['Muito bagunçada e me estresa','Organizada em alguns cômodos','Razoável, mas poderia melhorar','Bem organizada'] },
  { id:'q2', text:'Qual sensação predomina na sua rotina diária?', opts:['Sobrecarga constante','Cansaço e falta de tempo','Equilíbrio parcial','Leveza e controle'] },
  { id:'q3', text:'Como é sua relação com objetos e acúmulo?', opts:['Acumulo muito, difícil desapegar','Tenho itens que não preciso','Às vezes acumulo, consigo organizar','Sou bastante seletiva'] },
  { id:'q4', text:'Você consegue manter as rotinas que cria?', opts:['Raramente','Às vezes, por pouco tempo','Na maioria das vezes','Sim, consistentemente'] },
  { id:'q5', text:'O que você mais deseja ao concluir a Bridge?', opts:['Paz mental e menos ansiedade','Casa organizada e funcional','Rotina equilibrada','Todos os anteriores'] },
];
const scoreMap = [1,2,3,4];
function getProfile(s) {
  if (s<=10) return { title:'Sobrecarregada', description:'Você está vivendo no meio do caos e precisa urgentemente de uma estrutura simples para recuperar o controle.' };
  if (s<=15) return { title:'Em Transição', description:'Você já tem algumas áreas organizadas, mas falta consistência. Pequenos ajustes vão trazer grande alívio.' };
  return { title:'Quase Lá', description:'Sua base já é sólida. Agora é hora de refinar a rotina e sustentar o que você já construiu.' };
}
async function saveDiagnostic(userId, result) {
  if (!userId) return;
  const rows = Object.entries(result.answers).map(([qid,a]) => ({ user_id:userId, question:qid, answer:a.text, score:a.score }));
  rows.push({ user_id:userId, question:'perfil', answer:result.profile.title, score:result.totalScore });
  await supabase.from('diagnostics').insert(rows);
  const { data: trail } = await supabase.from('trails').select('id').ilike('name','%diagn%').limit(1).maybeSingle();
  if (trail?.id) await supabase.from('progress').upsert({ user_id:userId, trail_id:trail.id, completed:true, completed_at:new Date().toISOString() }, { onConflict:'user_id,trail_id' });
}
function DiagnosticScreen({ onFinish, userId }) {
  const [cur, setCur] = useState(0);
  const [answers, setAns] = useState({});
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const q = questions[cur];
  const progress = (cur/questions.length)*100;
  const answer = (opt) => {
    const optIndex = q.opts.indexOf(opt);
    const updated = { ...answers, [q.id]:{ text:opt, score:scoreMap[optIndex] } };
    setAns(updated);
    if (cur<questions.length-1) setCur(cur+1);
    else { const totalScore = Object.values(updated).reduce((sum,a)=>sum+a.score,0); setResult({ answers:updated, totalScore, profile:getProfile(totalScore) }); }
  };
  const finish = async () => { setSaving(true); await saveDiagnostic(userId, result); setSaving(false); onFinish(); };
  if (result) return (
    <View style={dg.container}><View style={dg.inner}>
      <Text style={dg.step}>Seu Perfil</Text>
      <Text style={dg.title}>{result.profile.title}</Text>
      <Text style={dg.question}>{result.profile.description}</Text>
      <TouchableOpacity style={dg.option} onPress={finish} disabled={saving}><Text style={[dg.optText,{textAlign:'center',fontWeight:'600'}]}>{saving?'Salvando...':'Continuar →'}</Text></TouchableOpacity>
    </View></View>
  );
  return (
    <View style={dg.container}>
      <View style={dg.bar}><View style={[dg.fill,{width:`${progress}%`}]} /></View>
      <ScrollView contentContainerStyle={dg.inner}>
        <Text style={dg.step}>{cur+1} de {questions.length}</Text>
        <Text style={dg.title}>Diagnóstico</Text>
        <Text style={dg.question}>{q.text}</Text>
        {q.opts.map((opt,i) => <TouchableOpacity key={i} style={dg.option} onPress={()=>answer(opt)}><Text style={dg.optText}>{opt}</Text></TouchableOpacity>)}
      </ScrollView>
      {cur>0 && <TouchableOpacity style={dg.back} onPress={()=>setCur(cur-1)}><Text style={dg.backText}>← Voltar</Text></TouchableOpacity>}
    </View>
  );
}
const dg = StyleSheet.create({
  container: { flex:1, backgroundColor:C.navy },
  bar:       { height:3, backgroundColor:'rgba(255,255,255,.1)' },
  fill:      { height:'100%', backgroundColor:C.sand },
  inner:     { padding:32, paddingTop:60, paddingBottom:90 },
  step:      { fontSize:12, color:C.sand, fontWeight:'600', letterSpacing:2, textTransform:'uppercase', marginBottom:8 },
  title:     { fontSize:28, fontWeight:'300', color:'#fff', marginBottom:24 },
  question:  { fontSize:20, color:'#fff', lineHeight:30, marginBottom:40, fontWeight:'300' },
  option:    { backgroundColor:'rgba(255,255,255,.07)', borderWidth:1, borderColor:'rgba(200,184,154,.25)', borderRadius:14, padding:20, marginBottom:12 },
  optText:   { color:'#fff', fontSize:15, lineHeight:22 },
  back:      { padding:20, alignItems:'center' },
  backText:  { color:'rgba(255,255,255,.4)', fontSize:14 },
});

// ═══════════════════════════════════════
// HOME TAB
// ═══════════════════════════════════════
function HomeTab({ user }) {
  const firstName = user.name.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
  const [completedLessons, setCompletedLessons] = React.useState(0);
  const [completedTrails, setCompletedTrails] = React.useState([]);
  const trailNames = ['Diagnóstico','Organizar','Simplificar','Sustentar','Florescer'];
  const totalLessons = 24;
  React.useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const r = await fetch(`${SUPA_URL}/rest/v1/lesson_progress?user_id=eq.${user.id}&select=trail_id,lesson_title`, { headers: { apikey:SUPA_KEY, Authorization:`Bearer ${_accessToken||SUPA_KEY}` } });
        const data = await r.json();
        if (!Array.isArray(data)) return;
        setCompletedLessons(data.length);
        setCompletedTrails([...new Set(data.map(r=>r.trail_id))]);
      } catch(e) {}
    };
    load();
  }, [user?.id]);
  const pct = Math.round((completedLessons/totalLessons)*100);
  const trailIds = ['1','2','3','4','5'];
  let currentTrailIdx = 0;
  for (let i=0;i<trailIds.length;i++) { if (completedTrails.includes(trailIds[i])) currentTrailIdx=i; }
  return (
    <View style={{ flex:1 }}>
      <Image source={{ uri: HOME_BG }} style={{ position:'absolute', top:0, left:0, right:0, bottom:0, width:'100%', height:'100%' }} resizeMode="cover" />
      <View style={{ position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(245,240,232,0.82)' }} />
      <ScrollView style={{ flex:1 }} contentContainerStyle={hm.inner}>
      <View style={hm.header}>
        <View><Text style={hm.greeting}>{greeting},</Text><Text style={hm.name}>{firstName} 🌿</Text></View>
        <View style={hm.badge}><Text style={hm.badgeText}>{trailNames[currentTrailIdx]}</Text></View>
      </View>
      <View style={hm.card}>
        <Text style={hm.cardLabel}>Sua travessia</Text>
        <View style={{ flexDirection:'row', alignItems:'baseline', gap:6, marginBottom:10 }}>
          <Text style={hm.pct}>{pct}%</Text><Text style={hm.pctSub}>completo</Text>
        </View>
        <View style={hm.bar}><View style={[hm.barFill,{width:`${pct}%`}]} /></View>
        <View style={hm.stages}>
          {trailNames.map((s,i)=>(
            <View key={i} style={hm.stageItem}>
              <View style={[hm.dot, i<=currentTrailIdx&&hm.dotActive]} />
              <Text style={[hm.stageLabel, i<=currentTrailIdx&&hm.stageLabelActive]}>{s}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={hm.nextCard}>
        <Text style={hm.nextLabel}>Próxima atividade</Text>
        <Text style={hm.nextTitle}>Continue sua jornada na etapa {trailNames[currentTrailIdx]}</Text>
      </View>
      <Text style={hm.sectionTitle}>Trilhas</Text>
      {TRAILS.map((t,i) => {
        const isDone = completedTrails.includes(trailIds[i]);
        const isCurrent = i===currentTrailIdx;
        return (
          <View key={t.id} style={[hm.trail, isDone&&{opacity:.5}]}>
            <View style={hm.trailNum}><Text style={{ fontWeight:'700', color:C.navy }}>{t.num}</Text></View>
            <View style={{ flex:1 }}>
              <Text style={hm.trailName}>{t.icon} {t.name}</Text>
              <Text style={hm.trailDesc}>{t.desc}</Text>
            </View>
            {isDone&&!isCurrent&&<Text style={{ color:C.green, fontSize:18 }}>✓</Text>}
            {isCurrent&&<Text style={{ color:C.sand, fontSize:18 }}>→</Text>}
          </View>
        );
      })}
    </ScrollView>
    </View>
  );
}
const hm = StyleSheet.create({
  container:        { flex:1, backgroundColor:C.cream },
  inner:            { padding:24, paddingTop:60, paddingBottom:90 },
  header:           { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 },
  greeting:         { fontSize:14, color:C.muted },
  name:             { fontSize:26, fontWeight:'600', color:C.navy },
  badge:            { backgroundColor:C.navy, paddingHorizontal:14, paddingVertical:6, borderRadius:20 },
  badgeText:        { color:C.sand, fontSize:12, fontWeight:'600' },
  card:             { backgroundColor:'rgba(255,255,255,0.88)', borderRadius:20, padding:24, marginBottom:16 },
  cardLabel:        { fontSize:11, fontWeight:'600', color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:10 },
  pct:              { fontSize:40, fontWeight:'700', color:C.navy },
  pctSub:           { fontSize:14, color:C.muted },
  bar:              { height:6, backgroundColor:C.sand2, borderRadius:3, marginBottom:16 },
  barFill:          { height:'100%', backgroundColor:C.sand, borderRadius:3 },
  stages:           { flexDirection:'row', justifyContent:'space-between' },
  stageItem:        { alignItems:'center', gap:4 },
  dot:              { width:8, height:8, borderRadius:4, backgroundColor:C.sand2 },
  dotActive:        { backgroundColor:C.navy },
  stageLabel:       { fontSize:8, color:'#bbb', textAlign:'center' },
  stageLabelActive: { color:C.navy, fontWeight:'600' },
  nextCard:         { backgroundColor:C.navy, borderRadius:20, padding:24, marginBottom:24 },
  nextLabel:        { fontSize:11, color:C.sand, fontWeight:'600', letterSpacing:1, textTransform:'uppercase', marginBottom:8 },
  nextTitle:        { fontSize:15, color:'#fff', lineHeight:22 },
  sectionTitle:     { fontSize:16, fontWeight:'700', color:C.navy, marginBottom:14 },
  trail:            { backgroundColor:'rgba(255,255,255,0.88)', borderRadius:16, padding:18, marginBottom:10, flexDirection:'row', alignItems:'center', gap:14 },
  trailNum:         { width:36, height:36, borderRadius:18, backgroundColor:C.cream, alignItems:'center', justifyContent:'center' },
  trailName:        { fontWeight:'600', color:C.navy, fontSize:15, marginBottom:4 },
  trailDesc:        { fontSize:12, color:C.muted, lineHeight:18 },
});

// ═══════════════════════════════════════
// CONTEÚDO DAS AULAS
// ═══════════════════════════════════════
const TRAIL_CONTENT = {
  '1': [
{ title: 'O peso invisível da desordem', type: 'artigo', content: 'Você já acordou cansada, antes mesmo de o dia começar? Olhou ao redor e sentiu uma pressão difícil de nomear — como se a casa em si estivesse te pesando? Esse fenômeno tem nome e tem explicação científica.\n\nPesquisas da Universidade da Califórnia mostram que mulheres que descrevem suas casas como "desorganizadas" apresentam níveis significativamente mais altos de cortisol ao longo do dia — o hormônio do estresse. E o mais impactante: esse efeito persiste mesmo quando elas estão fora de casa. O ambiente físico continua ocupando espaço mental mesmo quando você não está nele.\n\nA desordem não é apenas visual. Ela funciona como uma lista de tarefas inacabadas permanentemente ativada no seu cérebro. Cada objeto fora do lugar é um micro-sinal que seu sistema nervoso interpreta como "pendência". Multiplique isso por dezenas de objetos espalhados, e você tem um estado de alerta constante — mesmo sem perceber.\n\nIsso afeta diretamente sua capacidade de descansar, de focar, de ser criativa e de estar presente. Não é fraqueza. Não é frescura. É neurociência.\n\n— O QUE ACONTECE NO SEU CÉREBRO —\n\nExiste um conceito chamado carga cognitiva — a quantidade de informação que seu cérebro precisa processar simultaneamente. Em um ambiente desorganizado, essa carga está sempre elevada.\n\nImagine tentar assistir a um filme com dez pessoas falando ao mesmo tempo ao seu redor. Você até consegue, mas sai exausta. É exatamente isso que acontece quando seu ambiente está sobrecarregado: seu cérebro tenta processar tudo ao mesmo tempo, o tempo todo, sem descanso.\n\nHá também o que os psicólogos chamam de efeito Zeigarnik — a tendência do cérebro de manter tarefas inacabadas ativas na memória. Cada gaveta bagunçada, cada canto acumulado, cada objeto sem lugar é uma tarefa inacabada que seu cérebro recusa-se a fechar. Elas ficam lá, em segundo plano, consumindo energia que você poderia usar para o que realmente importa.\n\n— ISSO É MAIS COMUM DO QUE PARECE —\n\nNo Brasil, a cultura do "guardar por precaução" é profunda. Crescemos vendo nossas mães e avós guardarem caixas, tecidos, objetos "que podem ser úteis um dia". Isso não é defeito — é herança cultural, muitas vezes ligada a períodos de escassez real.\n\nMas o mundo mudou. E carregar esse peso hoje, num ritmo de vida já intenso, tem um custo alto. A mulher brasileira contemporânea geralmente acumula: a rotina da casa, o trabalho fora, os filhos, os pais, as demandas sociais. Adicione um ambiente que não restaura — e você tem a fórmula do esgotamento silencioso que tantas mulheres reconhecem mas raramente conseguem nomear.\n\n— O CAMINHO INVERSO TAMBÉM É REAL —\n\nAmbientes organizados reduzem a carga cognitiva, facilitam o sono, diminuem a ansiedade e aumentam a sensação de controle sobre a própria vida. Estudos mostram que pessoas que passam apenas 20 minutos organizando um espaço relatam melhora imediata no humor e na sensação de competência.\n\nOrganizar a casa não é uma tarefa doméstica. É um ato profundo de autocuidado.\n\n— EXERCÍCIO DESTA AULA —\n\nEscolha um único cômodo da sua casa — de preferência aquele que você usa com mais frequência. Entre nesse espaço e fique parada por 2 minutos. Sem arrumar nada. Apenas observe e sinta.\n\nDepois responda, por escrito:\n• Qual é a primeira sensação ao entrar aqui?\n• Se esse ambiente fosse uma palavra, qual seria?\n• Tem algo neste espaço que te incomoda há semanas, mas você já nem vê mais?\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual cômodo da sua casa você evita — mesmo inconscientemente?\n2. Quando foi a última vez que você entrou em casa e sentiu alívio imediato ao olhar ao redor?\n3. Se sua casa pudesse te dar um recado hoje, o que ela diria?\n\n— PRÓXIMA AULA —\n\nAgora que você começou a nomear o que sente, a próxima aula vai te ajudar a mapear sua casa cômodo por cômodo — para enxergar com clareza onde estão seus pontos de tensão e seus pontos de força.' },

{ title: 'Mapeando sua realidade atual', type: 'checklist', content: 'Na aula anterior, você começou a nomear o que sente em relação ao seu ambiente. Agora vamos um passo além: transformar essa percepção em um mapa concreto.\n\nUm mapa tem um poder que a sensação não tem — ele torna visível o que antes era difuso. Quando você enxerga sua casa no papel, para de carregar tudo na cabeça. E o que está no papel pode ser trabalhado. O que está só na cabeça vira ansiedade.\n\nEste exercício não é uma avaliação. Não existe certo ou errado, casa boa ou casa ruim. É apenas um olhar honesto sobre o ponto de partida — e todo ponto de partida é válido, porque é real.\n\n— COMO FAZER O MAPEAMENTO —\n\nReserve entre 20 e 30 minutos. Pegue um caderno ou o notes do celular. Percorra cada cômodo da sua casa com calma — não para arrumar, mas para observar. Para cada ambiente, responda as cinco perguntas abaixo.\n\n— AS CINCO PERGUNTAS PARA CADA CÔMODO —\n\n✅ Este espaço me causa paz ou ansiedade ao entrar?\nConfie na primeira sensação, antes de qualquer racionalização. Seu corpo sabe antes da sua mente.\n\n✅ Consigo encontrar o que preciso em menos de 2 minutos?\nEsse é um teste prático de funcionalidade. Se você precisa procurar, o sistema está falhando.\n\n✅ Me sinto bem recebendo visitas neste cômodo?\nNão porque a casa precisa ser perfeita para os outros — mas porque essa pergunta revela o quanto você mesma aceita o espaço como ele está.\n\n✅ Este ambiente reflete quem eu sou hoje?\nNão quem você era há cinco anos, não quem você quer ser. Quem você é agora, nesta fase da vida.\n\n✅ Quando estou neste espaço, consigo descansar de verdade?\nDescanso real — não apenas parar o corpo, mas soltar a mente.\n\n— CLASSIFICANDO CADA CÔMODO —\n\nAo terminar as cinco perguntas de cada ambiente, dê a ele uma classificação:\n\n🟢 VERDE — Este espaço me serve bem. Posso aprender com ele.\n🟡 AMARELO — Funciona parcialmente. Precisa de atenção em alguns pontos.\n🔴 VERMELHO — Este espaço me pesa. É uma prioridade de transformação.\n\nNão existe proporção certa entre as cores. Algumas casas têm tudo vermelho — e tudo bem. Esse é o ponto de partida, não o destino.\n\n— UM EXEMPLO REAL —\n\nMaria tem 38 anos, dois filhos e trabalha em home office. Quando fez esse exercício, descobriu que a cozinha estava vermelha — bancada sempre acumulada, gavetas que ela evitava abrir. O quarto estava vermelho — a cadeira virou um segundo guarda-roupa. Mas o banheiro estava verde — o único espaço onde ela tinha um sistema claro.\n\nO banheiro verde foi a revelação mais importante. Ali ela tinha, sem perceber, criado um sistema que funcionava. A travessia dela começou por entender o que ela já fazia certo — e replicar essa lógica nos outros espaços.\n\n— EXERCÍCIO DESTA AULA —\n\nFaça o mapeamento completo da sua casa. Ao final, você terá:\n• Uma lista de todos os cômodos com a classificação verde, amarelo ou vermelho\n• Uma visão clara de onde estão seus maiores pontos de tensão\n• Pelo menos um espaço verde para celebrar e aprender com ele\n\nGuarde esse mapa. Você vai revisitá-lo ao final da trilha Organizar para ver o quanto avançou.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual cômodo te surpreendeu — para melhor ou para pior — durante o mapeamento?\n2. O espaço verde que você encontrou: o que você fez diferente ali? O que pode replicar?\n3. Olhando para os espaços vermelhos, qual deles afeta mais diretamente sua rotina diária?\n\n— PRÓXIMA AULA —\n\nAgora que você tem o mapa, a próxima aula vai identificar seus pontos críticos de sobrecarga — os momentos específicos do dia em que a desorganização cobra o maior preço. Porque nem toda tensão tem a ver com o espaço físico. Algumas das sobrecargas mais pesadas são invisíveis.' },

{ title: 'Identificando seus pontos de sobrecarga', type: 'artigo', content: 'Você já tem o mapa da sua casa. Já sabe quais espaços te servem e quais te pesam. Agora vamos aprofundar esse olhar para identificar algo mais específico — e mais revelador: os pontos críticos de sobrecarga.\n\nUm ponto crítico não é apenas um espaço bagunçado. É a interseção entre um espaço, um momento do dia e uma emoção. É onde a desorganização física encontra a pressão do tempo e cria aquela sensação insuportável de estar sempre atrasada, sempre correndo, sempre com a sensação de que algo está escapando entre os dedos.\n\nIdentificar seus pontos críticos é uma das ações mais estratégicas que você pode fazer antes de começar qualquer reorganização. Porque quando você age nos pontos certos, o alívio é imediato e real — e esse alívio gera energia para continuar.\n\n— O QUE É UM PONTO CRÍTICO —\n\nUm ponto crítico tem três elementos simultâneos:\n\nUM ESPAÇO — um cômodo, uma superfície, um canto específico da casa.\nUM HORÁRIO — um momento do dia em que aquele espaço concentra pressão.\nUMA EMOÇÃO — frustração, culpa, pressa, vergonha, impotência.\n\nQuando os três se encontram com frequência, você tem um ponto crítico. E ele está consumindo energia sua todos os dias — mesmo nos dias em que você não percebe conscientemente.\n\n— OS PONTOS CRÍTICOS MAIS COMUNS —\n\n🍳 A bancada da cozinha entre 17h e 19h\nO jantar precisa ser feito, as crianças chegam da escola, o trabalho ainda não terminou. E a bancada está coberta de coisas acumuladas desde a manhã. O que deveria ser um momento de cuidado vira um campo de batalha logístico.\n\n👗 O closet entre 6h30 e 7h30\nA roupa certa não aparece. Você experimenta três combinações, descarta tudo, sai de casa com a sensação de derrota — e o dia ainda mal começou. Cada manhã assim é uma pequena sangria de autoconfiança.\n\n📚 A mesa de trabalho a qualquer hora\nDocumentos, carregadores, correspondências, objetos sem sentido. Um espaço que deveria promover foco se torna um espelho da desorganização — e dificulta qualquer tentativa de concentração profunda.\n\n🚪 A entrada da casa ao final do dia\nA bolsa fica no chão, os sapatos espalhados, as chaves em lugar nenhum. A entrada que deveria sinalizar "você chegou, pode descansar" sinaliza o oposto.\n\n📋 A agenda mental da semana\nEsse ponto crítico não tem localização física — ele existe na sua cabeça. São os compromissos que você teme esquecer, as tarefas que ficam na memória porque não estão escritas em lugar nenhum.\n\n— POR QUE OS PONTOS CRÍTICOS SE REPETEM —\n\nFLUXO SEM DESTINO — objetos que chegam a um espaço mas não têm para onde ir. A bancada acumula porque não existe um sistema claro de para onde cada coisa vai.\n\nTRANSIÇÃO DE ESTADO — momentos em que você muda de modo (trabalho para casa, manhã para tarde) são naturalmente vulneráveis à desorganização. A mente está fazendo uma troca de contexto e o ambiente sofre as consequências.\n\nDECISÃO ADIADA — muitos pontos críticos são cemitérios de decisões postergadas. A pilha de roupas na cadeira são decisões de "onde isso fica?" que você não tomou ainda.\n\nEntender o mecanismo por trás do seu ponto crítico é mais poderoso do que simplesmente organizar o espaço — porque sem entender a causa, o espaço volta ao mesmo estado em semanas.\n\n— UM EXEMPLO REAL —\n\nClaudia, 41 anos, professora e mãe de dois filhos, identificou seu principal ponto crítico: a entrada da casa entre 18h e 19h. Todo dia, ao chegar do trabalho, ela deixava a bolsa no chão, os sapatos onde tirava, as compras na primeira superfície disponível.\n\nQuando analisou o padrão, percebeu que o problema não era falta de organização — era ausência de sistema. A solução foi simples: um gancho na parede, um tapete demarcando a zona de sapatos, uma cesta para itens temporários. Três objetos. Dez minutos de implementação. O ponto crítico desapareceu — e com ele, a sensação de derrota que ela carregava todo dia ao chegar em casa.\n\n— EXERCÍCIO DESTA AULA —\n\nDurante os próximos 3 a 5 dias, observe sua rotina com um olhar de detetive. Toda vez que sentir frustração ou peso relacionados à casa, anote:\n\n📍 Onde você estava — cômodo ou espaço específico\n🕐 Que horas eram — o horário revela padrões\n😤 O que sentiu — a emoção exata, sem julgamento\n🔍 O que estava tentando fazer — a ação que foi frustrada\n\nAo final dos 5 dias, releia suas anotações. Dois ou três pontos críticos vão aparecer com clareza — os mesmos espaços, os mesmos horários, as mesmas emoções se repetindo. Esses são seus pontos de partida prioritários.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual momento do seu dia você mais teme em relação à organização da casa?\n2. Se você pudesse eliminar apenas um ponto crítico amanhã, qual mudaria mais sua qualidade de vida?\n3. Pensando no seu ponto crítico principal: ele é um problema de espaço, de sistema ou de decisão adiada?\n\n— PRÓXIMA AULA —\n\nAgora você sabe onde estão seus pontos de sobrecarga. Mas antes de começar a agir, existe uma etapa fundamental que a maioria das pessoas pula — e que explica por que tantas reorganizações não duram. Na próxima aula você vai criar sua intenção de travessia: o porquê profundo que vai te sustentar nos dias difíceis e dar direção a cada escolha daqui para frente.' },

{ title: 'Criando sua intenção de travessia', type: 'artigo', content: 'Você chegou à última aula da Trilha Diagnosticar. Até aqui, você nomeou o que sente, mapeou sua casa, identificou seus pontos críticos. Você tem clareza sobre o ponto de partida.\n\nAgora vem a etapa que a maioria das pessoas pula — e que faz toda a diferença entre uma reorganização que dura e uma que se desfaz em três semanas.\n\nAntes de mover um único objeto, precisamos responder a pergunta mais importante de toda a travessia: Para quê?\n\n— A DIFERENÇA ENTRE META E INTENÇÃO —\n\nUma META é externa e mensurável. "Organizar o closet até sexta." Metas têm valor — mas elas não te sustentam nos dias difíceis. Quando a semana desanda, a meta vira culpa.\n\nUma INTENÇÃO é interna e afetiva. Ela não descreve o que você vai fazer — descreve como você quer se sentir. E sentimentos têm uma força motivacional muito mais profunda e duradoura do que tarefas.\n\nA intenção de travessia é pessoal, específica e visceral. Não é "ter uma casa organizada". É:\n\n"Quero ter energia para brincar com minha filha depois do jantar — sem sentir que a casa está me cobrando algo."\n\n"Quero me sentir bem recebendo uma amiga sem precisar pedir desculpas pelo ambiente antes de ela entrar."\n\n"Quero acordar na segunda-feira sem aquela sensação de peso antes mesmo de o dia começar."\n\nEssas intenções têm um rosto, um horário, uma emoção específica. Elas são reais porque descrevem momentos reais da sua vida.\n\n— POR QUE A INTENÇÃO SUSTENTA QUANDO A MOTIVAÇÃO SOME —\n\nA motivação é um estado emocional — ela vem e vai. Você pode estar muito motivada hoje e completamente sem energia na quinta-feira depois de um dia longo. Isso é humano e previsível.\n\nA intenção funciona diferente. Ela não depende de como você está se sentindo agora. É uma âncora que você criou num momento de clareza para usar nos momentos de névoa.\n\nPesquisas em psicologia da motivação mostram que pessoas que conectam seus objetivos a valores e emoções pessoais têm duas vezes mais chance de manter comportamentos novos ao longo do tempo, comparado a pessoas que trabalham apenas com metas funcionais.\n\n— O QUE UMA INTENÇÃO DE TRAVESSIA NÃO É —\n\nNão é uma promessa de perfeição. "Quero ter uma casa sempre organizada" é uma armadilha. Sempre é impossível — e impossível vira desistência.\n\nNão é para os outros. "Quero que meu marido pare de reclamar" coloca sua transformação nas mãos de outra pessoa.\n\nNão é uma punição disfarçada. "Preciso me organizar porque sou uma bagunça" parte de autocrítica — e autocrítica raramente sustenta transformação real.\n\nNão precisa ser grandiosa. "Quero conseguir tomar café da manhã sentada, com calma, sem olhar para a pia cheia" é uma intenção completamente válida — e profundamente humana.\n\n— UM EXEMPLO REAL —\n\nRenata, 35 anos, trabalha em home office e tem um filho de 4 anos. Sua primeira intenção foi: "Quero ter uma casa organizada e limpa." Genérica demais.\n\nTrabalhando mais fundo, ela chegou a: "Quero que meu filho veja a mãe relaxada em casa — não sempre correndo, sempre estressada com a bagunça. Quero que ele lembre da nossa casa como um lugar gostoso."\n\nNos dias sem energia, ela relia essa intenção. Não porque a obrigava a fazer alguma coisa — mas porque a reconectava ao que importava. E às vezes isso era suficiente para dar um pequeno passo.\n\n— EXERCÍCIO DESTA AULA —\n\nEncontre 10 a 15 minutos de silêncio. Pegue um caderno e responda por escrito:\n\n1. Como eu quero me sentir ao chegar em casa depois de um dia longo?\n2. Que momento do dia eu mais quero transformar?\n3. Daqui a 3 meses, se essa travessia der certo, o que terá mudado de concreto na minha vida?\n4. Quem se beneficia, além de mim, quando meu ambiente está em paz?\n\nAgora reúna as respostas em uma ou duas frases, escritas no presente, como se já fossem realidade:\n\n"Minha casa é um lugar de restauro. Eu chego e solto o peso do dia. Minha manhã começa com calma e meu dia começa inteiro."\n\nEscreva no papel. Fotografe. Cole na porta do armário. Você vai revisitar esse texto nos dias difíceis.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual foi a parte mais difícil de criar sua intenção? O que essa dificuldade revela?\n2. Existe alguém na sua vida que se beneficiaria diretamente da sua travessia?\n3. Se você pudesse escrever uma carta para si mesma daqui a 3 meses, o que a versão futura diria sobre essa decisão de começar?\n\n— TRILHA 1 CONCLUÍDA —\n\nVocê não apenas leu sobre organização — você começou a se conhecer como alguém que vive num espaço físico e é afetada por ele. Agora você tem um mapa real da sua casa, clareza sobre seus pontos críticos e uma intenção que vai além da superfície.\n\nA Trilha Organizar começa exatamente onde você está agora. A primeira aula vai te mostrar como transformar esse diagnóstico em ação concreta — sem a paralisia do "por onde começo?". Sua travessia está só começando. 🌿' },
  ],
  '2': [
{ title: 'Por onde começar (sem se sentir perdida)', type: 'artigo', content: 'Você concluiu a Trilha Diagnosticar com algo que a maioria das pessoas não tem quando tenta se organizar: um mapa real da sua casa, clareza sobre seus pontos críticos e uma intenção que vai além da superfície.\n\nAgora começa a ação. E é exatamente aqui que a maioria das pessoas tropeça — não por falta de vontade, mas por falta de método.\n\nA maior armadilha da organização é a paralisia do "tudo ao mesmo tempo". Você olha para a casa inteira, sente que é demais, e acaba não fazendo nada. Ou faz tudo de uma vez, fica exausta em três horas e abandona antes do fim do dia — deixando a casa pela metade, o que é pior do que antes.\n\n— O MÉTODO DAS ONDAS —\n\nA ideia é simples: em vez de tentar organizar a casa inteira, você escolhe um único ponto de impacto — o espaço que mais afeta sua rotina diária. Você age ali com foco e profundidade. Quando esse espaço está funcionando bem, a energia gerada por essa vitória te impulsiona para o próximo.\n\nO Método das Ondas funciona por três razões:\n\nVITÓRIAS CONCRETAS GERAM DOPAMINA — Quando você completa algo, seu cérebro libera dopamina, o neurotransmissor da recompensa. Isso cria motivação real para continuar.\n\nFOCO PROFUNDO SUPERA ESFORÇO DISPERSO — Uma hora de atenção total num único espaço transforma mais do que três horas pulando de cômodo em cômodo sem terminar nada.\n\nO MOMENTUM É REAL — Organização gera organização. Quando um espaço está funcionando bem, você começa a enxergar os outros com mais clareza — e com mais energia para agir.\n\n— COMO APLICAR O MÉTODO DAS ONDAS —\n\nPASSO 1 — Escolha seu ponto de impacto\nVolte ao mapa que você criou na Trilha Diagnosticar. Olhe para os espaços vermelhos. Qual desses espaços, se organizado, mudaria mais sua rotina diária?\n\nPASSO 2 — Defina um bloco de tempo\nTrabalhe em blocos de 25 a 45 minutos, nunca mais que isso sem uma pausa. Nosso foco tem limite fisiológico — respeitar isso não é fraqueza, é inteligência.\n\nPASSO 3 — Regra da caixa de redistribuição\nColoque uma caixa vazia na entrada do cômodo. Tudo que não pertence àquele espaço vai para a caixa — mas você não sai para guardar agora. Você termina o cômodo primeiro, depois redistribui.\n\nPASSO 4 — Termine o que começou\nNão passe para o próximo espaço antes de concluir o atual. Uma gaveta completamente organizada vale mais do que cinco gavetas pela metade.\n\nPASSO 5 — Celebre e registre\nQuando terminar, tire uma foto do espaço. Sente-se ali por 5 minutos e sinta a diferença. Esse momento de reconhecimento consciente é parte do processo.\n\n— A ORDEM RECOMENDADA —\n\n1º O quarto — é o espaço que você vê primeiro ao acordar e último ao dormir. Um quarto que restaura muda o tom emocional de todo o dia.\n2º A cozinha — coração operacional da casa. Quando a cozinha funciona, o dia flui com menos atrito.\n3º O closet — elimina a fadiga de decisão matinal e começa o dia com mais autoconfiança.\n4º As áreas comuns — sala, corredor, entrada — os espaços que todos usam e ninguém organiza.\n5º Documentos e papéis — a desordem invisível que gera ansiedade silenciosa.\n\n— UM EXEMPLO REAL —\n\nFernanda, 43 anos, tinha a casa inteira para organizar e não sabia por onde começar. Toda vez que tentava, ficava sobrecarregada e desistia no meio.\n\nQuando aplicou o Método das Ondas, escolheu começar pela bancada da cozinha — seu ponto crítico mais doloroso. Dedicou 40 minutos numa tarde de sábado. Só a bancada. Nada mais.\n\nO resultado foi imediato. Preparar o jantar naquela noite foi diferente. Em três semanas, a cozinha estava completamente transformada — sem nenhuma tarde exaustiva de reorganização total. "Eu sempre achei que precisava de um fim de semana inteiro livre para organizar. Mas o que eu precisava era de método."\n\n— EXERCÍCIO DESTA AULA —\n\nOlhe para o mapa da sua casa e escolha seu primeiro ponto de impacto. Escreva:\n\n📍 O espaço que vou transformar primeiro:\n⏱️ O bloco de tempo que vou reservar:\n📅 O dia e horário específico:\n\nNão deixe em aberto. Uma intenção com data e hora tem quatro vezes mais chance de acontecer do que uma intenção sem prazo.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual foi sua maior dificuldade nas vezes em que tentou se organizar antes? Como o Método das Ondas endereça essa dificuldade?\n2. Qual espaço da sua casa, se transformado, mudaria mais sua rotina nos próximos 30 dias?\n3. O que costuma interromper seus esforços de organização? Como você pode proteger seu bloco de tempo dessa vez?\n\n— PRÓXIMA AULA —\n\nVocê tem o método. Agora vamos para o primeiro espaço — e o mais poderoso para começar: o quarto. Na próxima aula você vai entender por que esse cômodo tem um impacto desproporcional na sua saúde mental e vai receber um checklist completo para transformá-lo passo a passo.' },

{ title: 'O quarto que restaura', type: 'checklist', content: 'Seu quarto é o espaço mais íntimo da casa. É o primeiro ambiente que você vê ao acordar — antes de qualquer tela, qualquer demanda, qualquer notificação. E é o último que você vê antes de dormir. Esse cômodo define o tom emocional de 24 horas da sua vida.\n\nA ciência do sono confirma: ambientes com menos estímulos visuais e ausência de desordem visual promovem sono mais profundo e restaurador. Um quarto que restaura não precisa ser grande, decorado ou caro. Precisa ser intencional.\n\n— O QUE ROUBA A PAZ DO QUARTO —\n\nA CADEIRA ACUMULADORA — em quase toda casa brasileira existe uma cadeira no quarto que virou um segundo guarda-roupa. Roupas que "foram usadas mas ainda podem ser usadas de novo", peças que não foram guardadas. Essa cadeira é o símbolo da decisão adiada.\n\nO CRIADO-MUDO SOBRECARREGADO — remédios, livros empilhados, carregadores, recibos, bijuterias, copos d\'água velhos. Uma superfície que deveria ser de descanso virou depósito de tudo que não tem lugar definido.\n\nO EMBAIXO DA CAMA — invisível mas presente na memória. Caixas sem identificação, objetos esquecidos. O que está fora de vista ainda ocupa espaço mental.\n\nAS TELAS NO QUARTO — celular na cabeceira, televisão ligada para dormir. As telas mantêm a mente em modo de processamento quando ela deveria estar desacelerando.\n\n— CHECKLIST COMPLETO —\n\nSUPERFÍCIES\n✅ O criado-mudo tem no máximo: luminária, livro ou caderno em uso, e um item pessoal significativo\n✅ A penteadeira ou cômoda está livre de objetos que não pertencem ali\n✅ Não existe "a cadeira" acumulando roupas — cada peça tem um destino claro\n✅ O topo do guarda-roupa não está sendo usado como depósito\n\nROUPAS E GUARDA-ROUPA\n✅ Todas as roupas têm um lugar definido — não ficam "de passagem" em nenhuma superfície\n✅ As peças que você usa com mais frequência estão nas posições mais acessíveis\n✅ Não há roupas que você nunca usa ocupando espaço de roupas que você usa todo dia\n✅ Existe um sistema claro para roupas usadas mas não sujas (gancho, cesto dedicado)\n\nEMBAIXO DA CAMA\n✅ Está completamente vazio — permitindo circulação de ar e limpeza fácil\n✅ Ou está organizado em caixas identificadas com itens de uso sazonal\n\nAMBIENTE\n✅ O quarto tem ventilação adequada e entrada de luz natural\n✅ Há pelo menos um elemento que te traz prazer estético: planta, quadro, vela, objeto afetivo\n✅ As cortinas ou persianas permitem escurecer o ambiente para dormir\n✅ Não há equipamentos de trabalho visíveis no quarto\n\nTECNOLOGIA\n✅ O celular não carrega na cabeceira — existe um local fora do alcance imediato\n✅ Se há televisão, existe um horário definido para desligar\n✅ Há pelo menos 30 minutos de rotina noturna sem telas antes de dormir\n\n— O TESTE FINAL —\n\nDepois de aplicar o checklist, deite na sua cama e olhe ao redor por 2 minutos sem fazer nada. O que você sente? O ambiente te convida ao descanso — ou ainda tem algo te puxando para a ação, para a culpa, para a lista mental de pendências?\n\nUm quarto que restaura é aquele onde você consegue deitar e soltar. Onde o ambiente diz ao seu sistema nervoso: aqui você pode descansar. Aqui está tudo bem.\n\n— UM EXEMPLO REAL —\n\nTatiana, 37 anos, reclamava que nunca conseguia descansar de verdade — mesmo nos fins de semana. Acordava cansada, dormia com dificuldade, sentia que o quarto a sufocava.\n\nQuando fez o checklist, identificou três problemas: a cadeira acumuladora com três semanas de roupas empilhadas, o criado-mudo com onze itens sobre ele, e o celular sempre carregando a 30 centímetros do rosto.\n\nEla dedicou uma tarde para resolver os três. Na primeira semana, relatou dormir melhor do que em meses. "Parece bobo," ela disse, "mas é como se o quarto finalmente tivesse me dado permissão para descansar."\n\n— EXERCÍCIO DESTA AULA —\n\nAplique o checklist completo no seu quarto hoje ou nos próximos dois dias. Use o Método das Ondas: um bloco de 40 minutos por vez.\n\nAo final, tire duas fotos: uma do antes e uma do depois. Guarde as duas. Você vai querer ver essa comparação daqui a algumas semanas.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual item do checklist mais te surpreendeu — porque você nem havia percebido que era um problema?\n2. A cadeira acumuladora existe no seu quarto? O que ela revela sobre as decisões que você tem adiado?\n3. Como você quer se sentir nos primeiros 5 minutos após acordar? O seu quarto atual apoia essa sensação?\n\n— PRÓXIMA AULA —\n\nCom o quarto transformado, a próxima aula vai para o coração operacional da casa: a cozinha. É o espaço onde o dia converge — manhã, almoço, fim de tarde. Quando a cozinha funciona bem, tudo ao redor flui com menos atrito.' },

{ title: 'A cozinha funcional', type: 'artigo', content: 'A cozinha é o coração operacional da casa. É onde o dia começa — o café da manhã apressado, a marmita que precisa ser preparada, a primeira xícara de chá em silêncio. É onde o fim do dia converge — o jantar, as conversas, a louça acumulada desde a manhã.\n\nPor tudo isso, a cozinha é também, para a maioria das mulheres, uma das maiores fontes de estresse doméstico. Não porque cozinhar seja difícil — mas porque cozinhar num espaço desorganizado é genuinamente exaustivo.\n\nUma cozinha funcional não é uma cozinha de revista. É uma cozinha que funciona para a sua realidade específica — com o seu espaço, os seus utensílios, a sua rotina.\n\n— O PRINCÍPIO CENTRAL: ORGANIZAÇÃO POR FREQUÊNCIA DE USO —\n\nA maioria das cozinhas está organizada por categoria. Isso parece lógico, mas ignora algo fundamental: você não usa todas as panelas com a mesma frequência.\n\nUSO DIÁRIO — ao alcance das mãos, sem abrir nada\nO que você usa todo dia deve estar imediatamente acessível. A faca do dia a dia, a tábua de corte, o azeite, o sal, a xícara favorita. Sem precisar abrir gaveta, sem precisar se abaixar, sem precisar procurar.\n\nUSO SEMANAL — acessível, mas pode exigir um passo\nO que você usa toda semana pode estar numa gaveta ou armário de fácil acesso. Panelas regulares, temperos que entram na maioria das receitas.\n\nUSO OCASIONAL — pode estar menos acessível\nO que você usa raramente — a forma de bolo especial, o liquidificador de festas — pode ficar em prateleiras altas ou armários mais fundos.\n\n— AS ZONAS DE TRABALHO DA COZINHA —\n\n🔪 ZONA DE PREPARO\nPróxima à bancada principal. Tábua de corte, facas, descascador, temperos de uso frequente, tigelas de preparo.\n\n🍳 ZONA DE COCÇÃO\nPróxima ao fogão. Panelas, frigideiras, espátulas, conchas, pegadores, luvas de forno. O que você usa durante o cozimento não deveria estar do outro lado da cozinha.\n\n🚿 ZONA DE HIGIENE\nPróxima à pia. Esponja, detergente, pano de prato, lixo.\n\n🥫 ZONA DE ARMAZENAMENTO\nDespensa e armários de alimentos. Organizada por categoria e frequência — o que você usa todo dia na frente, o que usa raramente no fundo.\n\n☕ ZONA DE BEBIDAS\nSe você toma café ou chá todos os dias, crie uma mini estação dedicada. Cafeteira, xícaras, açúcar, pó — tudo num único local. Esse pequeno sistema elimina vários passos desnecessários toda manhã.\n\n— O PROBLEMA DA BANCADA —\n\nA bancada é a superfície mais valiosa da cozinha — e a mais sabotada.\n\nUma bancada funcional tem apenas o que é usado todo dia: cafeteira, porta-utensílios com os essenciais, tábua de corte se você cozinha diariamente. Nada mais.\n\nO TESTE DA BANCADA: retire tudo que está sobre ela. Limpe a superfície. Agora devolva apenas o que você usa todos os dias. O que sobrou fora da bancada — encontre um lugar nos armários ou avalie se precisa mesmo estar na cozinha.\n\n— UM EXEMPLO REAL —\n\nDébora, 44 anos, dizia que odiava cozinhar. Evitava a cozinha, pedia delivery com frequência, sentia culpa por isso.\n\nQuando analisamos a cozinha dela, o problema ficou claro: a bancada tinha doze itens permanentes, as panelas que ela usava todo dia estavam no armário mais alto, e os temperos estavam espalhados em três lugares diferentes.\n\nEm uma tarde, reorganizamos por frequência de uso e criamos as zonas de trabalho. As panelas do dia a dia foram para o armário mais acessível. A bancada ficou com quatro itens. Os temperos ganharam um lugar único próximo ao fogão.\n\nDuas semanas depois, Débora disse algo que ficou: "Eu não odiei cozinhar essa semana. Acho que eu odiava o caos, não a comida."\n\n— EXERCÍCIO DESTA AULA —\n\nEscolha um bloco de 45 minutos e faça o seguinte:\n\nPARTE 1 — Mapeie sua cozinha atual (10 minutos)\nAbra todos os armários e gavetas. Para cada grupo de objetos, pergunte: com que frequência uso isso? Diariamente, semanalmente ou raramente?\n\nPARTE 2 — Identifique seus conflitos (10 minutos)\nO que de uso diário está num lugar difícil de acessar? O que de uso raro está ocupando os melhores espaços? Anote os três maiores conflitos.\n\nPARTE 3 — Faça as trocas prioritárias (25 minutos)\nResolva os três conflitos que você identificou. Não tente reorganizar tudo — resolva os pontos de maior impacto primeiro.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual é o momento do dia em que a cozinha mais te estressa? O que especificamente acontece nesse momento?\n2. Se você fosse redesenhar sua cozinha do zero, mantendo os mesmos armários e espaço, o que mudaria primeiro?\n3. Existe algo na sua cozinha que você guarda mas nunca usa — e que poderia liberar um espaço valioso?\n\n— PRÓXIMA AULA —\n\nCom a cozinha reorganizada por função e frequência, a próxima aula vai para o closet — o espaço que define como você começa cada manhã. Você vai entender por que a maioria dos closets sabota a autoconfiança feminina diariamente, e vai aprender a criar um sistema que funciona para a sua vida real.' },

{ title: 'Closet sem culpa', type: 'artigo', content: 'São 7h da manhã. Você abre o closet, tem dezenas de peças, e ainda assim sente que não tem nada para vestir. Fica olhando por minutos, experimenta três combinações, descarta tudo, e sai de casa com a sensação de derrota — antes das 8h da manhã.\n\nIsso acontece com uma frequência impressionante entre mulheres de todos os perfis, todas as rendas, todos os tamanhos de guarda-roupa. E quase sempre é interpretado como um problema pessoal. Não é nada disso. É fadiga de decisão — e o closet está causando isso.\n\n— O QUE É FADIGA DE DECISÃO —\n\nNosso cérebro toma milhares de micro-decisões por dia, e cada uma delas consome energia mental real. Essa reserva é finita — começa cheia pela manhã e vai sendo depletada ao longo do dia.\n\nO problema é que a maioria das pessoas gasta uma quantidade desproporcional dessa reserva logo cedo, na frente do closet, tomando decisões ruins sobre roupas que não servem bem, combinações que não funcionam, peças no lugar errado.\n\nUm closet que funciona não é um closet cheio. É um closet onde cada peça é uma boa opção — e onde encontrar o que você precisa leva menos de 30 segundos.\n\n— POR QUE GUARDAMOS ROUPAS QUE NÃO USAMOS —\n\n"QUANDO EMAGRECER" — peças de tamanhos menores guardadas como meta ou punição. Elas não motivam — lembram diariamente de algo que você ainda não é. E ocupam espaço de roupas que te servem hoje.\n\n"FOI CARO, NÃO POSSO JOGAR FORA" — o custo já foi pago. Manter uma peça que você não usa não recupera o dinheiro — apenas ocupa espaço e energia mental.\n\n"PODE SER ÚTIL UM DIA" — o dia específico que justifique aquela peça raramente chega. E quando chega, você provavelmente vai comprar algo mais adequado.\n\n"É UMA LEMBRANÇA" — algumas peças têm valor afetivo real. Mas se você não as usa e elas não estão expostas como objeto de memória, estão apenas acumulando espaço e culpa.\n\n"VOU CONSERTAR" — a blusa com botão faltando, o vestido que precisa de ajuste. Se está esperando conserto há mais de 6 meses, a probabilidade de que isso aconteça é muito baixa.\n\nReconhecer esses padrões sem julgamento é o primeiro passo. Eles não são falhas de caráter — são mecanismos psicológicos comuns.\n\n— O SISTEMA BRIDGE PARA O CLOSET —\n\nPASSO 1 — Esvazie completamente\nTire tudo do closet. Tudo. Coloque sobre a cama ou no chão. Você precisa ver o que tem antes de decidir o que fica.\n\nPASSO 2 — Aplique o filtro de três perguntas\nPara cada peça, responda honestamente:\n• Eu me sinto bem usando isso?\n• Eu usei essa peça nos últimos 12 meses?\n• Essa peça serve à minha vida hoje?\n\nSe a resposta for não em duas ou três perguntas: a peça sai.\n\nPASSO 3 — Organize por categoria e frequência\nDevolva as peças organizadas por categoria e dentro de cada categoria, por frequência de uso. O que você usa toda semana fica na frente e no centro.\n\nPASSO 4 — Crie um sistema de saída permanente\nColoque um cesto no fundo do closet dedicado a peças que você decide soltar ao longo do tempo. Quando uma peça não funcionar mais, vai direto para o cesto. Quando encher, você doa.\n\nPASSO 5 — Resolva as pendências\nAs peças que precisam de conserto: dê um prazo de 30 dias. Se não foram consertadas, saem.\n\n— CRIANDO COMBINAÇÕES QUE FUNCIONAM —\n\nUm closet que funciona não é só organizado — é combinável. Isso significa que a maioria das peças funciona com a maioria das outras.\n\nPerguntas para avaliar se seu closet é combinável:\n• Cada peça combina com pelo menos três outras peças que você tem?\n• Você tem mais peças neutras do que estampadas e coloridas?\n• Seus sapatos e bolsas funcionam com a maioria das suas roupas?\n\nSe a resposta for não para a maioria, você pode ter muitas peças e ainda assim poucas combinações — que é exatamente o que gera a sensação de "não tenho nada para vestir".\n\n— UM EXEMPLO REAL —\n\nCarolina, 39 anos, tinha um closet com mais de 200 peças e vivia com a sensação de não ter roupa. Toda manhã era uma batalha.\n\nQuando aplicou o sistema Bridge, saíram 87 peças. O que ficou foram 113 peças — mas todas que ela genuinamente usava e nas quais se sentia bem.\n\n"Parece que tenho mais roupa agora do que antes," ela disse, "porque consigo ver tudo e tudo funciona." Suas manhãs mudaram. Não porque ela ficou mais decidida — mas porque o closet parou de ser um campo minado de decisões ruins.\n\n— EXERCÍCIO DESTA AULA —\n\nReserve uma manhã ou tarde de fim de semana para aplicar o sistema completo. Separe:\n\n📦 Uma caixa para doação — peças em bom estado para brechó, amigos ou instituições\n🗑️ Uma sacola para descarte — peças muito desgastadas\n🪡 Uma pilha para conserto — com prazo de 30 dias\n\nColoque uma música que você gosta, prepare um chá ou café, e encare esse processo como um presente que você está se dando — não como uma tarefa.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual padrão você mais se identificou — "quando emagrecer", "foi caro", "pode ser útil"? O que esse padrão revela sobre sua relação com as roupas?\n2. Como você se sente quando está bem vestida, com uma roupa que te serve bem? Esse sentimento merece acontecer todos os dias?\n3. Se seu closet pudesse falar, o que ele diria sobre quem você está tentando ser?\n\n— PRÓXIMA AULA —\n\nCom quarto, cozinha e closet transformados, a próxima aula vai para os espaços compartilhados — sala, corredor, entrada. Você vai aprender como criar estruturas que funcionam mesmo quando outras pessoas da família ainda não aderiram à organização.' },

{ title: 'Sala e áreas comuns', type: 'checklist', content: 'As áreas comuns da casa carregam um desafio único: são usadas por todos, mas organizadas quase sempre por uma pessoa só. A sala, o corredor, a entrada — esses espaços absorvem o fluxo de toda a família ao longo do dia, e sem sistemas claros, acumulam tudo que não tem lugar definido em nenhum outro cômodo.\n\nQuando as áreas comuns funcionam bem, o efeito é imediato e visível para toda a família. E espaços que todos usam e todos veem têm mais chance de serem mantidos — quando o sistema é simples o suficiente para ser seguido sem instrução.\n\n— O PRINCÍPIO FUNDAMENTAL: TODO OBJETO PRECISA DE UM ENDEREÇO —\n\nNas áreas comuns, o caos quase sempre tem a mesma raiz: objetos sem endereço fixo. Um endereço não é "em algum lugar na sala". É "nesta cesta, nesta prateleira, neste gancho específico".\n\nQuando cada objeto tem um endereço preciso, devolver é automático — não exige decisão, não exige esforço mental. Sem endereço fixo, cada objeto guardado vira uma micro-decisão. E micro-decisões repetidas criam fadiga — e eventualmente, abandono do sistema.\n\nA pergunta que deve guiar a organização: se alguém entrasse nesta casa pela primeira vez, sem nenhuma instrução, conseguiria encontrar e devolver qualquer objeto sem precisar perguntar?\n\n— A ENTRADA DA CASA —\n\nA entrada é o primeiro e o último espaço que você experimenta todos os dias. É onde a transição acontece — de fora para dentro, do mundo para o lar.\n\nUma entrada funcional tem:\n\n🔑 UM LUGAR FIXO PARA CHAVES — gancho, tigela ou caixa pequena. Sempre no mesmo lugar. Sem exceção.\n\n👟 UM SISTEMA PARA SAPATOS — sapateira, cesto, tapete demarcado. Os sapatos ficam até aqui, não além.\n\n🎒 UM GANCHO OU CABIDEIRO — para bolsas, mochilas, casacos de uso frequente. O que você usa todo dia precisa de um lugar acessível perto da saída.\n\n📬 UMA SUPERFÍCIE DE TRIAGEM — para correspondências e itens temporários. Com uma regra clara: nada fica aqui por mais de 24 horas.\n\n— A SALA DE ESTAR —\n\nOs maiores acumuladores da sala:\n\nSUPERFÍCIES HORIZONTAIS — mesa de centro, aparador, estantes. A regra: no máximo três itens intencionais sobre cada superfície.\n\nCONTROLES E CABOS — controles remotos, carregadores, fones. Crie um local único e fixo para todos eles. Uma cesta pequena resolve esse problema completamente.\n\nBRINQUEDOS E PERTENCES DAS CRIANÇAS — crie zonas claras e cestos identificados. As crianças conseguem seguir sistemas simples quando eles são óbvios.\n\nREVISTAS E PAPÉIS AVULSOS — um cesto dedicado para leitura em andamento e uma regra de descarte semanal resolve.\n\n— CHECKLIST PARA SUAS ÁREAS COMUNS —\n\nENTRADA\n✅ As chaves têm um lugar fixo — sempre o mesmo, sem exceção\n✅ Os sapatos têm um sistema claro — não ficam espalhados além da zona definida\n✅ Bolsas e mochilas têm ganchos ou local definido\n✅ Correspondências têm uma superfície de triagem com prazo de 24h\n✅ A entrada, quando em ordem, transmite a sensação de "chegou, pode respirar"\n\nSALA DE ESTAR\n✅ As superfícies têm no máximo 3 itens intencionais cada\n✅ Controles remotos e cabos têm um local único e fixo\n✅ Brinquedos e pertences têm cestos ou zonas claramente definidas\n✅ Existe um sistema para leituras em andamento\n✅ Qualquer membro da família consegue repor os itens no lugar sem instrução\n\nGERAL\n✅ Todo objeto nas áreas comuns tem um endereço fixo e específico\n✅ Os sistemas são simples o suficiente para os dias cansativos\n✅ O espaço, quando em ordem, convida ao descanso e à conexão\n✅ Existe um ritual de reset rápido — diário ou semanal\n\n— O RESET DE 10 MINUTOS —\n\nTodo dia, num horário fixo — geralmente antes do jantar ou antes de dormir — percorra as áreas comuns com uma cesta e devolva cada objeto ao seu endereço. Não limpe, não reorganize, não entre em projetos. Apenas devolva.\n\n10 minutos por dia evitam o colapso semanal que exige horas de reorganização.\n\nPara que o reset funcione com a família: torne visível e previsível. "Às 20h fazemos o reset juntos" funciona melhor do que "arruma quando lembrar". Crianças a partir de 4 anos conseguem participar — e quando participam desde cedo, desenvolvem o hábito naturalmente.\n\n— UM EXEMPLO REAL —\n\nPriscila, 40 anos, sentia que a sala nunca estava em ordem — apesar de passar horas organizando nos fins de semana. Na segunda-feira, já estava caótica de novo.\n\nO problema era claro: nenhum objeto tinha endereço fixo. Em uma tarde, criamos endereços para cada categoria: uma cesta para controles e cabos, dois cestos para os brinquedos do filho, uma tigela na entrada para chaves. Implementamos o reset de 10 minutos antes do jantar.\n\nTrês semanas depois: "A sala não está perfeita o tempo todo. Mas agora quando bagunça, a gente resolve em 10 minutos. Antes levava o fim de semana."\n\n— EXERCÍCIO DESTA AULA —\n\nPercorra suas áreas comuns com o checklist em mãos. Para cada item que não está funcionando, identifique:\n\n📍 O problema: qual objeto não tem endereço? Qual superfície está acumulando?\n💡 A solução simples: um gancho, uma cesta, uma tigela, uma regra clara.\n📅 O prazo: quando você vai implementar essa solução?\n\nDepois, teste o reset de 10 minutos por 7 dias seguidos. Observe o que muda — não só na casa, mas no seu estado mental ao entrar e sair dos espaços.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual área comum da sua casa mais te incomoda quando está em desordem? O que especificamente te incomoda nela?\n2. Existe algum objeto nas suas áreas comuns que nunca tem lugar — que sempre está "de passagem"? Qual endereço faz sentido para ele?\n3. O reset de 10 minutos parece viável na sua rotina? Qual seria o melhor horário para implementá-lo?\n\n— PRÓXIMA AULA —\n\nCom os espaços físicos organizados, a última aula desta trilha vai para um tipo de desordem que não tem cômodo — mas que gera ansiedade em praticamente toda casa: os documentos e papéis. Você vai aprender um sistema simples e definitivo para acabar com esse caos de uma vez.' },

{ title: 'Documentos e papéis: fim do caos', type: 'artigo', content: 'Existe um tipo de desordem que não ocupa espaço visível na sala, não bagunça o closet, não acumula na bancada da cozinha — mas que gera uma das ansiedades mais persistentes dentro de casa: a desordem de papéis.\n\nContas que você não sabe se pagou. Documentos que precisam ser assinados. Exames médicos que deveriam estar num lugar seguro mas você não faz ideia de onde. O contrato do apartamento que você vai precisar um dia e torce para encontrar quando precisar.\n\nPapéis espalhados são micro-ansiedades permanentes. Cada pilha é uma lista de tarefas não resolvidas, cada documento perdido é uma potencial crise futura. E o mais frustrante: o problema não é que você é desorganizada. É que ninguém nunca te ensinou um sistema para gerenciar esse fluxo constante de papel que chega na sua casa toda semana.\n\n— POR QUE OS PAPÉIS SÃO TÃO DIFÍCEIS DE ORGANIZAR —\n\nOs objetos físicos têm uma vantagem: você os vê. Uma pilha de roupas é visível, incomoda, pede ação. Um envelope fechado sobre a mesa parece inofensivo — até você abrir e descobrir que era uma notificação importante com prazo vencido.\n\nOs papéis também chegam em categorias muito diferentes misturadas: propaganda que vai direto para o lixo, conta que precisa ser paga até sexta, documento que precisa ser guardado por anos. Sem um sistema de triagem, tudo vai para a mesma pilha — e a pilha cresce até se tornar intimidadora demais para ser atacada.\n\n— O SISTEMA DE 3 CAIXAS BRIDGE —\n\n📥 CAIXA DE ENTRADA\nPara onde vai absolutamente tudo que chega em papel. Correspondências, recibos, folhetos, documentos, notas fiscais. Tudo vai aqui primeiro, sem triagem imediata.\n\nA regra de ouro: nunca deixe papel em nenhum outro lugar da casa antes de passar pela caixa de entrada. A entrada centralizada é o que impede as pilhas espalhadas.\n\n📋 CAIXA DE AÇÃO\nItens que precisam de uma ação específica e com prazo. Conta para pagar, formulário para assinar, consulta para agendar.\n\nEsta caixa deve ser esvaziada uma vez por semana — num dia e horário fixos. O que não foi resolvido na semana anterior tem prioridade.\n\n🗂️ CAIXA DE ARQUIVO\nDocumentos que precisam ser guardados por mais tempo: contratos, documentos pessoais, comprovantes importantes, exames médicos, registros escolares.\n\nO QUARTO DESTINO — DESCARTE IMEDIATO\nPropagandas, folhetos, envelopes vazios, recibos sem importância. Vai direto para o lixo — sem passar pela caixa de entrada, sem criar pilha intermediária.\n\n— CRIANDO SEU ARQUIVO PERMANENTE —\n\nAs categorias que funcionam para a maioria das casas brasileiras:\n\n🏠 CASA — contratos de aluguel ou financiamento, condomínio, IPTU, documentos do imóvel\n💰 FINANÇAS — extratos importantes, comprovantes de pagamento, declaração de imposto de renda\n🏥 SAÚDE — exames, laudos, receitas médicas em uso, carteirinhas de plano de saúde\n📚 ESCOLA / TRABALHO — documentos escolares, diplomas, certificados, contratos de trabalho\n👤 DOCUMENTOS PESSOAIS — RG, CPF, passaporte, certidões, título de eleitor\n🚗 VEÍCULOS — documentos do carro, IPVA, seguro, revisões\n\n— A REVOLUÇÃO DO DIGITAL —\n\nO celular resolve a maioria dos arquivos. Aplicativos como Adobe Scan ou CamScanner transformam qualquer papel em PDF em segundos.\n\nCrie uma pasta no Google Drive com as mesmas categorias do arquivo físico. Gratuito, acessível de qualquer lugar, nunca se perde em enchente ou mudança.\n\nA regra: documento importante → digitaliza → arquiva fisicamente se necessário → descarta a cópia extra.\n\n— A ROTINA SEMANAL DE PAPÉIS —\n\nUma vez por semana, reserve 15 a 20 minutos para:\n\n1. Triar a Caixa de Entrada — o que vai para Ação, Arquivo ou lixo\n2. Esvaziar a Caixa de Ação — pagar, assinar, agendar\n3. Arquivar a Caixa de Arquivo — distribuir nas pastas corretas\n4. Digitalizar o que vale guardar digitalmente\n\n20 minutos por semana. Esse é o investimento para nunca mais perder um documento importante, nunca mais pagar multa por conta esquecida, nunca mais sentir aquela ansiedade surda de "tem algo que eu deveria estar fazendo com esses papéis".\n\n— UM EXEMPLO REAL —\n\nAndressa, 36 anos, tinha uma gaveta na cozinha que ela chamava de "a gaveta do caos" — onde iam todos os papéis que chegavam em casa. Em dois anos, acumulou mais de 400 documentos misturados: contas pagas e não pagas, exames médicos, manuais de eletrodomésticos, cardápios de delivery de 2019.\n\nQuando implementou o Sistema de 3 Caixas, a triagem inicial levou duas horas — mas foi feita uma única vez. Do que havia ali, 70% foi para o lixo imediatamente.\n\n"Parece que tirei um peso que eu nem sabia que estava carregando. Eu evitava aquela gaveta porque ela me lembrava de tudo que eu não tinha resolvido."\n\n— EXERCÍCIO DESTA AULA —\n\nPARTE 1 — Monte seu sistema\nConsiga três caixas ou cestos pequenos. Identifique: Entrada, Ação, Arquivo. Posicione num local acessível e visível.\n\nPARTE 2 — A triagem inicial\nReúna todos os papéis espalhados pela casa. Coloque tudo na Caixa de Entrada. Depois faça a triagem: lixo, ação ou arquivo.\n\nPARTE 3 — Monte suas pastas\nCrie as pastas de arquivo com as categorias que fazem sentido para sua realidade.\n\nPARTE 4 — Agende sua rotina semanal\nEscolha o dia e horário. Coloque na agenda. Trate como compromisso fixo — porque é.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Existe algum papel que você está evitando encarar? O que ele representa além do papel em si?\n2. Já perdeu algo importante por não ter um sistema de arquivo? Como se sentiu naquele momento?\n3. Quais categorias de documentos fazem mais sentido para a sua realidade específica?\n\n— TRILHA 2 CONCLUÍDA —\n\nVocê agora tem sistemas funcionando em cada área da sua casa. Mas sistemas novos quebram. A vida acontece, as semanas ficam cheias, a casa volta a acumular. Isso não é fracasso — é previsível.\n\nA Trilha Simplificar vai um nível mais fundo: não apenas organizar o que existe, mas questionar o que precisa existir. Você vai aprender a arte de soltar o que não serve mais — objetos, compromissos, padrões mentais — para que os sistemas que você criou aqui possam respirar e durar. 🌿' },
  ],

  '3': [
{ title: 'A arte de soltar o que não serve mais', type: 'artigo', content: 'Você organizou. Criou sistemas. Transformou espaços. E provavelmente percebeu algo ao longo desse processo: em muitos momentos, o maior obstáculo não era falta de espaço, falta de tempo ou falta de método. Era a dificuldade de soltar.\n\nEsta trilha vai um nível mais fundo do que organizar. Vai te convidar a questionar o que realmente precisa existir no seu espaço — e te dar ferramentas para soltar com leveza o que não serve mais. Não por minimalismo radical. Por liberdade real.\n\n— A PSICOLOGIA DO APEGO AOS OBJETOS —\n\nGuardar objetos "por precaução" é um dos padrões mais comuns e mais silenciosamente custosos nas casas brasileiras. Mas antes de tentar mudar esse padrão, é importante entendê-lo — porque ele não é irracional. Ele tem raízes profundas e legítimas.\n\nO EFEITO DOTAÇÃO\nPesquisas do psicólogo Daniel Kahneman mostram que as pessoas valorizam objetos que possuem de duas a três vezes mais do que objetos idênticos que não possuem. Só pelo fato de ser seu, um objeto ganha valor emocional desproporcional ao seu valor real.\n\nA MEMÓRIA AFETIVA\nObjetos não são apenas objetos. São portais para memórias, fases da vida, pessoas amadas, versões de nós mesmas que já fomos. O vestido do casamento não é tecido — é um dia inteiro de emoção. A xícara da avó não é cerâmica — é a presença dela nas manhãs de domingo.\n\nO MEDO DA ESCASSEZ\nPara quem cresceu em contexto de escassez real ou observou isso nos pais e avós, descartar objetos em bom estado vai contra um instinto de sobrevivência profundamente enraizado. "Guardar por precaução" foi, em algum momento da história familiar, uma estratégia inteligente.\n\nA IDENTIDADE FUTURA\nGuardamos roupas de tamanho menor, equipamentos de hobbies abandonados, livros de cursos que pretendemos fazer. Esses objetos representam versões futuras de nós mesmas — e descartá-los parece uma desistência.\n\nEntender esses mecanismos com compaixão é o primeiro passo. Você não é desorganizada porque guarda demais. Você é humana.\n\n— O CUSTO REAL DO EXCESSO —\n\nCUSTO DE ESPAÇO — Objetos que não usamos ocupam espaço que poderia abrigar o que realmente importa. Cada metro quadrado da sua casa tem valor. Quando está ocupado por coisas sem uso, esse valor está sendo desperdiçado.\n\nCUSTO DE MANUTENÇÃO — Tudo que você possui precisa ser limpo, organizado, movido, mantido. Quanto mais objetos, mais trabalho invisível que consome tempo e energia.\n\nCUSTO COGNITIVO — Objetos sem uso funcionam como tarefas inacabadas na memória. Cada um é uma micro-decisão adiada que continua ocupando processamento mental.\n\nCUSTO EMOCIONAL — Objetos do passado que não nos servem mais podem nos manter presas em fases que já deveriam ter sido superadas. O vestido do "quando emagrecer" não motiva — lembra diariamente de algo que você ainda não é.\n\nSoltar não é perder. É uma escolha ativa sobre o que merece ocupar o espaço da sua vida agora.\n\n— A DIFERENÇA ENTRE SIMPLICIDADE E PRIVAÇÃO —\n\nSimplificar não é se privar. Minimalismo radical não funciona para a maioria das pessoas, especialmente para famílias com crianças, com história afetiva rica, com vidas complexas.\n\nO que estamos propondo é curadoria intencional. Uma casa com curadoria intencional tem exatamente o que você precisa e o que te traz alegria real — nem mais, nem menos. Tem personalidade, tem história, tem afeto. Mas cada objeto que está ali foi escolhido — não apenas acumulado.\n\n— A PERGUNTA QUE MUDA TUDO —\n\n"Este objeto serve à minha vida hoje?"\n\nNão à vida que tive. Não à vida que planejo ter. À vida que estou vivendo agora, nesta fase, com esta rotina, com este corpo, com estes valores.\n\nSe a resposta for sim — fica, com gratidão.\nSe a resposta for não — vai, com leveza.\n\nPara objetos com valor afetivo real, existe uma terceira opção: transformar em memória consciente. Um álbum, uma caixa de memórias curada, uma foto do objeto antes de doá-lo. Você guarda a memória sem precisar guardar o objeto.\n\n— UM EXEMPLO REAL —\n\nSimone, 45 anos, tinha uma casa com três quartos — e dois funcionavam como depósito. Toda vez que tentava organizar, se paralisava. "Parecia que jogar fora as coisas era jogar fora pedaços da minha vida."\n\nQuando mudamos a pergunta — de "posso jogar isso fora?" para "isso serve à minha vida hoje?" — algo mudou. Em três fins de semana, os dois quartos foram esvaziados. Saíram onze caixas para doação, quatro para descarte.\n\n"Eu chorei em vários momentos. Mas era um choro de leveza, não de perda. Parecia que eu estava me despedindo de fases com gratidão, em vez de carregá-las para sempre."\n\n— EXERCÍCIO DESTA AULA —\n\nEscolha um único espaço — uma gaveta, um armário, uma prateleira — e aplique a pergunta central para cada objeto: "Este objeto serve à minha vida hoje?"\n\nPara cada objeto que a resposta for não, pergunte também:\n• É um objeto com valor afetivo genuíno? → Considere transformar em memória consciente\n• Está em bom estado? → Doação\n• Está muito desgastado? → Descarte responsável\n• Tem valor de revenda? → Venda online (Enjoei, OLX, grupos de brechó)\n\nNão tente fazer tudo de uma vez. Uma gaveta completamente resolvida vale mais do que dez gavetas pela metade.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual dos mecanismos de apego você mais se identificou — efeito dotação, memória afetiva, medo de escassez ou identidade futura? Como ele aparece na sua casa?\n2. Existe um objeto específico que você sabe que deveria soltar mas não consegue? O que ele representa além do objeto em si?\n3. Se você pudesse visitar sua casa daqui a um ano, depois de ter feito a curadoria intencional, como você imagina que ela estaria?\n\n— PRÓXIMA AULA —\n\nAgora que você entende a psicologia por trás do apego e tem a pergunta central para guiar suas decisões, a próxima aula vai te dar um método estruturado para o descarte intencional — passo a passo, sem culpa e sem a paralisia que costuma acompanhar esse processo.' },

{ title: 'Método Bridge de descarte intencional', type: 'checklist', content: 'Na aula anterior, você entendeu por que soltar é difícil — e por que vale a pena fazer. Agora vamos para o como.\n\nO descarte intencional falha na maioria das vezes não por falta de vontade, mas por falta de estrutura. Você começa com energia, pega o primeiro objeto, fica em dúvida, coloca de volta — e em 20 minutos está exausta sem ter descartado nada.\n\nO Método Bridge de descarte intencional resolve esse problema com uma sequência clara de critérios. Cada objeto passa pelos mesmos filtros, na mesma ordem. As decisões ficam mais rápidas, mais claras e — com o tempo — mais naturais.\n\n— ANTES DE COMEÇAR: PREPARANDO O AMBIENTE —\n\nEscolha o momento certo — não faça descarte quando estiver cansada ou estressada. Reserve um momento com energia e tranquilidade.\n\nPrepare os destinos antes — tenha prontas: uma caixa para doação, uma sacola para descarte, uma área para venda, e um espaço para itens que voltam para o lugar.\n\nTrabalhe por categoria, não por cômodo — reúna todos os objetos da mesma categoria antes de decidir. Ao ver todas as suas canecas juntas, fica muito mais fácil perceber que você tem dezessete e usa quatro.\n\nDefina um tempo — sessões de 45 a 60 minutos são ideais. Mais do que isso, a fadiga de decisão aumenta e a qualidade das escolhas cai.\n\n— OS 4 FILTROS DO MÉTODO BRIDGE —\n\nFILTRO 1 — FREQUÊNCIA DE USO\nEu usei este item nos últimos 12 meses?\n\nSe não consegue lembrar quando foi a última vez, a resposta já está ali. Atenção às exceções legítimas: itens sazonais, itens de emergência, itens com uso específico mas real.\n\nFILTRO 2 — VALOR REAL\nEste objeto me traz alegria genuína ou tem utilidade concreta na minha vida atual?\n\nNão na vida que imagino ter. Na vida que estou vivendo agora. Uma dica: segure o objeto nas mãos por alguns segundos antes de responder. Nosso corpo muitas vezes sabe antes da nossa mente.\n\nFILTRO 3 — SUBSTITUIBILIDADE\nSe eu precisasse deste item amanhã e não o tivesse, conseguiria substituí-lo facilmente e sem grande custo?\n\nSe a resposta for sim — você pode soltar sem medo. O objeto é substituível. O espaço que ele ocupa hoje não é.\n\nFILTRO 4 — CUSTO DE MANTER\nQual é o espaço, energia e atenção que este objeto exige de mim? Vale a pena?\n\nAlguns objetos têm um custo de manutenção desproporcional ao benefício que oferecem. Este filtro ajuda a perceber o custo invisível de cada objeto.\n\n— A TABELA DE DECISÃO —\n\n✅ Uso com frequência e traz valor real → FICA\n❌ Não uso há mais de 12 meses e é substituível → SAI\n💛 Tem valor afetivo genuíno → FICA OU VIRA MEMÓRIA CONSCIENTE\n🎁 Está em bom estado mas não serve mais → DOAÇÃO\n🗑️ Está desgastado e sem uso → DESCARTE\n💰 Tem valor de revenda → VENDA\n🪡 Precisa de conserto há mais de 6 meses → PRAZO DE 30 DIAS OU DESCARTE\n\n— OS DESTINOS DO DESCARTE INTENCIONAL —\n\nDOAÇÃO — Para itens em bom estado. Opções: amigos e família, brechós físicos, instituições de caridade, grupos de doação no WhatsApp da sua cidade. Defina uma data — no máximo 7 dias — para entregar. Não guarde a caixa em casa por semanas.\n\nVENDA — Para itens com valor de revenda real. Enjoei para roupas e acessórios, OLX para móveis e eletrônicos. Defina um prazo de 30 dias — se não vendeu, doa.\n\nDESCARTE RESPONSÁVEL — Para itens muito desgastados. Eletrodomésticos e eletrônicos têm pontos de coleta específicos. Roupas muito desgastadas podem virar panos de limpeza antes do descarte final.\n\nMEMÓRIA CONSCIENTE — Para itens com valor afetivo real que você decide não guardar fisicamente. Fotografe antes de soltar. Crie uma pasta digital "Memórias" para essas fotos.\n\n— O SISTEMA DE SAÍDA PERMANENTE —\n\nMantenha sempre uma cesta aberta num canto discreto da casa. Toda vez que perceber que algo não te serve mais, vai direto para a cesta. Quando encher, você doa — sem triagem adicional, sem segunda análise.\n\nEsse sistema cria um fluxo de saída contínuo que impede o reacúmulo — e torna o descarte algo natural, não um evento traumático semestral.\n\n— UM EXEMPLO REAL —\n\nLuciana, 38 anos, tentou fazer descarte três vezes nos últimos dois anos. Todas as vezes, parou no meio. "Eu pegava uma coisa, ficava em dúvida, colocava de volta. Ficava exausta sem ter descartado nada."\n\nQuando aplicou os 4 filtros do Método Bridge, algo mudou. "Ter uma sequência tirou a paralisia. Eu não precisava decidir tudo ao mesmo tempo — só precisava responder uma pergunta de cada vez."\n\nEm duas sessões de 45 minutos, ela esvaziou o closet de um quarto inteiro. "O que me surpreendeu foi que não me arrependi de nada. Quando você toma a decisão com critério, ela fica clara."\n\n— CHECKLIST DESTA AULA —\n\nANTES DE COMEÇAR\n✅ Escolhi um momento com energia e tranquilidade\n✅ Tenho caixa de doação, sacola de descarte e área de venda prontas\n✅ Escolhi trabalhar por categoria, não por cômodo\n✅ Defini um tempo máximo de 60 minutos para esta sessão\n\nDURANTE O DESCARTE\n✅ Estou aplicando os filtros na ordem, um objeto por vez\n✅ Não estou colocando nada "de volta por enquanto" — a decisão é tomada agora\n✅ Itens de doação têm data definida para sair de casa\n✅ Itens de venda têm prazo de 30 dias — depois disso, doação\n\nDEPOIS DO DESCARTE\n✅ Tirei foto do espaço transformado\n✅ A caixa de doação tem destino e prazo definidos\n✅ Criei ou alimentei minha cesta de saída permanente\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual dos 4 filtros você acha que vai ser mais útil para você — e qual vai ser mais difícil de aplicar? Por quê?\n2. Já teve experiência de se arrepender de ter descartado algo? O que aprendeu com isso?\n3. O sistema de saída permanente parece viável para a sua rotina? Onde na sua casa faria mais sentido posicioná-lo?\n\n— PRÓXIMA AULA —\n\nCom o método de descarte intencional em mãos, a próxima aula vai para uma dimensão que a maioria das pessoas não considera quando pensa em simplificar: a sobrecarga mental. Porque a desordem mais pesada muitas vezes não está nos armários — está na cabeça.' },

{ title: 'Simplificando a rotina mental', type: 'artigo', content: 'Você aprendeu a simplificar os espaços físicos. Aprendeu a avaliar objetos, a criar sistemas, a soltar o que não serve mais. Mas existe uma forma de desordem que nenhuma reorganização de armário resolve. Que não aparece no mapa dos cômodos. Que não tem endereço fixo nem caixa de destino.\n\nÉ a desordem mental.\n\nSimplificar a mente não é esvaziar a cabeça — é criar estrutura para que o que importa tenha espaço para existir.\n\n— O QUE É SOBRECARGA MENTAL —\n\nA sobrecarga mental tem um nome técnico: carga cognitiva excessiva. É o estado em que a quantidade de informação que seu cérebro precisa gerenciar simultaneamente supera sua capacidade de processamento eficiente.\n\nNo contexto doméstico, essa sobrecarga se manifesta como:\n\nA LISTA MENTAL PERMANENTE — compromissos, recados, compras, ligações a fazer. Tudo guardado na memória porque não há um sistema externo confiável.\n\nAS DECISÕES REPETIDAS — o que cozinhar hoje, o que vestir amanhã. Decisões que poderiam ser sistematizadas mas são tomadas do zero todos os dias.\n\nOS COMPROMISSOS NÃO ESCOLHIDOS — reuniões que você não precisava estar, eventos que você foi por obrigação, tarefas que assumiu porque não soube dizer não.\n\nAS PREOCUPAÇÕES CIRCULARES — pensamentos sobre problemas que você não pode resolver agora. O cérebro em loop consome energia como um aplicativo rodando em segundo plano.\n\nA SÍNDROME DA MULHER QUE LEMBRA DE TUDO — nas famílias, frequentemente uma pessoa assume a função de gerenciar a memória coletiva: aniversários, consultas médicas, prazos escolares. Isso tem nome: carga mental invisível. E tem um custo real.\n\n— POR QUE A SOBRECARGA MENTAL SABOTA TUDO O MAIS —\n\nExiste um fenômeno estudado pelo psicólogo Roy Baumeister chamado depleção do ego: nossa capacidade de tomar boas decisões e manter foco é um recurso finito que se esgota ao longo do dia.\n\nQuando esse recurso é consumido com o trivial — decisões desnecessárias, preocupações circulares, compromissos que não deveriam ser seus — sobra menos para o essencial.\n\nÉ por isso que mulheres sobrecarregadas mentalmente frequentemente sentem que "não têm energia" para as coisas que mais importam. Não é falta de força de vontade. É esgotamento de um recurso cognitivo real.\n\n— AS QUATRO ESTRATÉGIAS DE SIMPLIFICAÇÃO MENTAL —\n\nESTRATÉGIA 1 — EXTERNALIZE TUDO\nFaça uma lista completa de tudo que está circulando na sua cabeça agora — tarefas, preocupações, compromissos, ideias, recados, pendências. Tudo, sem filtro.\n\nEsse exercício — o mind dump — tem um efeito imediato: quando algo está no papel, seu cérebro pode parar de trabalhar para "lembrar" e liberar essa energia para outras coisas.\n\nESTRATÉGIA 2 — REDUZA DECISÕES DIÁRIAS\nCada decisão trivial que você elimina preserva energia para decisões que importam.\n\n• Refeições da semana planejadas no domingo — elimina sete decisões diárias\n• Roupas separadas na noite anterior — elimina a batalha matinal do closet\n• Lista de compras atualizada em tempo real — elimina o esforço de lembrar o que falta\n• Rotina matinal fixa — os primeiros 30 minutos no piloto automático liberam energia para o que vem depois\n\nESTRATÉGIA 3 — CRIE FRONTEIRAS COM A TECNOLOGIA\nPesquisas mostram que uma interrupção de 3 segundos pode exigir até 23 minutos para recuperação completa do foco.\n\n• Desative todas as notificações que não são urgentes\n• Estabeleça dois ou três momentos fixos no dia para checar mensagens\n• Crie uma política de "não perturbe" nas refeições, primeiros 30 minutos da manhã e última hora antes de dormir\n• Remova da tela inicial os aplicativos que mais consomem atenção de forma não intencional\n\nESTRATÉGIA 4 — REDISTRIBUA A CARGA MENTAL INVISÍVEL\nA carga mental invisível não é uma responsabilidade natural das mulheres. É um papel que foi assumido e que pode ser redistribuído.\n\n• Torne visível o invisível — faça uma lista de tudo que você gerencia mentalmente pela família\n• Crie sistemas compartilhados — agenda digital acessível a todos, lista de compras compartilhada\n• Transfira com intenção — não "me ajuda mais", mas "a partir de agora, você é responsável por isso"\n• Resista ao impulso de assumir de volta — diferente não é errado\n\n— O DIÁRIO COMO FERRAMENTA DE SIMPLIFICAÇÃO —\n\nEscrever regularmente é uma das ferramentas mais poderosas de simplificação mental. Pesquisas do psicólogo James Pennebaker mostram que pessoas que escrevem sobre experiências difíceis por apenas 15 minutos por dia durante quatro dias apresentam melhora significativa em saúde mental e clareza cognitiva.\n\nVocê não precisa de um método elaborado. Pode ser:\n• Três coisas que estão na sua cabeça antes de dormir\n• Uma pergunta que você responde para si mesma toda manhã\n• Um registro livre do que você está sentindo e pensando\n\n— UM EXEMPLO REAL —\n\nRenata, 41 anos, era conhecida na família como "a que lembra de tudo". Sabia os aniversários de todos, os prazos das contas, as consultas dos filhos. "Eu me orgulhava disso. Mas estava sempre exausta. Dormia mal. Acordava já pensando na lista do dia."\n\nQuando mapeamos tudo que ela gerenciava mentalmente, foram 47 itens — loops abertos na sua cabeça, simultaneamente.\n\nSeis semanas depois de externalizar, redistribuir e eliminar: "Pela primeira vez em anos, consigo sentar e ler por uma hora sem minha cabeça ir para outro lugar. Parece que ganhei uma parte de mim de volta."\n\n— EXERCÍCIO DESTA AULA —\n\nPARTE 1 — O MIND DUMP (15 minutos)\nPegue papel e caneta. Escreva tudo que está na sua cabeça agora — tarefas, preocupações, compromissos, pendências, ideias. Tudo, sem filtro, sem ordem.\n\nPARTE 2 — A TRIAGEM (10 minutos)\nClassifique cada item:\n🔴 Ação urgente — precisa ser feito nos próximos 3 dias\n🟡 Ação futura — importante, mas não urgente\n🟢 Pode ser delegado — não precisa ser você\n⚪ Pode ser eliminado — não é realmente necessário\n🔵 Preocupação sem ação possível agora — pode ser solta\n\nPARTE 3 — UMA SIMPLIFICAÇÃO CONCRETA\nDas quatro estratégias, escolha uma para implementar esta semana:\n• Fazer o planejamento de refeições no próximo domingo\n• Desativar notificações desnecessárias hoje\n• Criar um sistema compartilhado de agenda ou lista de compras\n• Iniciar o hábito de escrever 10 minutos antes de dormir\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Quantos itens apareceram no seu mind dump? Esse número te surpreendeu?\n2. Qual das quatro estratégias você sente mais resistência em implementar — e o que essa resistência revela?\n3. Você carrega carga mental invisível pela sua família? O que poderia ser redistribuído esta semana?\n\n— PRÓXIMA AULA —\n\nCom a mente mais leve, a próxima aula vai tratar de algo que alimenta diretamente o reacúmulo — tanto físico quanto mental: o consumo. Porque simplificar perde sentido se continuamos trazendo para dentro de casa mais do que retiramos. Você vai entender os mecanismos por trás do consumo excessivo e aprender princípios concretos para comprar menos e melhor — sem privação e sem culpa.' },

{ title: 'Consumo consciente: comprando menos e melhor', type: 'artigo', content: 'Organizar e simplificar perde sentido se continuamos trazendo para dentro de casa mais do que retiramos. A raiz de muito do acúmulo doméstico não é falta de organização. É excesso de consumo.\n\nIsso não é um julgamento. É um diagnóstico honesto de um sistema que foi projetado para funcionar exatamente assim — para nos fazer querer mais, comprar mais, acumular mais.\n\n— COMO O CONSUMO EXCESSIVO ACONTECE —\n\nA ESCASSEZ ARTIFICIAL — "Últimas unidades!", "Oferta por tempo limitado!". A urgência criada artificialmente ativa o sistema de ameaça do cérebro e acelera decisões que deveriam ser lentas.\n\nA DOPAMINA DA ANTECIPAÇÃO — Pesquisas mostram que o prazer de antecipar uma compra é frequentemente maior do que o prazer de receber o produto. O cérebro libera dopamina no momento da compra — não necessariamente no momento do uso. É por isso que comprar alivia temporariamente — e por isso que o alívio não dura.\n\nAS INFLUENCIADORAS E O "MUST-HAVE" SEMANAL — A lógica das redes sociais transforma o consumo em identidade e pertencimento. Não é sobre o produto — é sobre quem você quer ser ao ter aquele produto.\n\nA FACILIDADE DO DIGITAL — Comprar ficou tão fácil que a fricção que antes existia desapareceu. Um clique, parcelado em doze vezes, entrega em casa. A facilidade remove as pausas naturais onde a reflexão aconteceria.\n\nAS PROMOÇÕES QUE "ECONOMIZAM" DINHEIRO — Comprar três pelo preço de dois de algo que você usaria um. O desconto faz parecer inteligente o que é, na prática, gastar mais.\n\n— O CUSTO REAL DO CONSUMO EXCESSIVO —\n\nCUSTO FINANCEIRO — Dinheiro gasto em objetos que não usa é dinheiro que não foi para experiências, segurança, sonhos.\n\nCUSTO DE ESPAÇO — Cada objeto comprado precisa de um lugar para ficar. Quando os espaços estão cheios, a casa deixa de respirar — e você também.\n\nCUSTO DE TEMPO — Pesquisar, comprar, receber, guardar, usar, limpar, manter, descartar. Cada objeto traz uma cadeia de tempo que raramente calculamos antes de comprar.\n\nCUSTO DE CLAREZA — Ambientes sobrecarregados dificultam a clareza mental. Menos objetos significa menos ruído visual, menos manutenção, mais espaço para o que realmente importa.\n\n— A DIFERENÇA ENTRE NECESSIDADE, DESEJO E IMPULSO —\n\nNECESSIDADE — algo que sua vida real, concreta, atual exige. Tem critérios objetivos.\n\nDESEJO — algo que você genuinamente quer e que vai trazer prazer ou valor real à sua vida. Desejos são legítimos — fazem parte de uma vida rica e intencional.\n\nIMPULSO — algo que você quer agora, impulsionada por um gatilho externo (promoção, influenciadora, tédio, ansiedade) ou interno (estresse, tristeza, euforia). Impulsos passam. O objeto fica.\n\nA maioria das compras que gera arrependimento e acúmulo é de impulso — não de necessidade ou desejo genuíno.\n\n— OS CINCO PRINCÍPIOS DO CONSUMO CONSCIENTE —\n\nPRINCÍPIO 1 — A REGRA DO ESPAÇO\nAntes de comprar qualquer item novo, identifique onde ele vai ficar na sua casa — não "em algum lugar", mas onde exatamente. Se não há um lugar claro e específico, ele não entra.\n\nPRINCÍPIO 2 — A ESPERA DE 72 HORAS\nPara qualquer compra não essencial, espere 72 horas antes de finalizar. A maioria dos impulsos de compra se dissolve nesse período. O que sobrevive tem muito mais chance de ser um desejo genuíno.\n\nPRINCÍPIO 3 — A PERGUNTA DAS CINCO VEZES\nAntes de comprar, pergunte "para quê?" e responda cinco vezes, progressivamente. Cada resposta revela uma camada mais profunda da motivação real. Às vezes confirma a compra. Frequentemente revela que o objeto não é a solução para o que você realmente precisa.\n\nPRINCÍPIO 4 — QUALIDADE SOBRE QUANTIDADE\nUm item bom que dura dez anos custa menos em dinheiro, espaço e energia mental do que cinco itens baratos que precisam ser substituídos a cada dois anos.\n\nPRINCÍPIO 5 — UM ENTRA, UM SAI\nPara cada item novo que entra na casa, um item equivalente sai. Uma roupa nova — uma roupa antiga vai para a cesta de doação. Esse princípio mantém o equilíbrio do volume de objetos e cria consciência natural antes de cada compra.\n\n— CONSUMO CONSCIENTE NÃO É NUNCA COMPRAR —\n\nÉ escolher com intenção. É saber a diferença entre uma compra que vai enriquecer sua vida e uma que vai apenas temporariamente aliviar um desconforto que voltará assim que a dopamina da antecipação passar.\n\nHá uma diferença enorme entre comprar um livro de um autor que você ama com intenção de ler — e comprar doze livros num momento de euforia que ficarão na estante sem serem abertos.\n\n— UM EXEMPLO REAL —\n\nGabriela, 33 anos, percebia que apesar de ganhar bem e não ter dívidas, nunca sobrava dinheiro. Quando fez um levantamento honesto, descobriu que gastava em média R$800 por mês em compras online — roupas, itens de decoração, utensílios — a maioria dos quais usava raramente ou nunca.\n\n"Eu comprava quando estava entediada, quando estava ansiosa, quando tinha tido um dia ruim. Era meu jeito de me sentir melhor."\n\nQuando implementou a espera de 72 horas: "Na primeira semana, coloquei sete coisas no carrinho. Depois de 72 horas, queria comprar só duas. Depois de mais 72 horas, queria comprar uma."\n\nEm três meses, suas compras online caíram para menos de um terço. O dinheiro foi para uma viagem que ela tinha adiado há dois anos. "Eu não parei de comprar. Passei a comprar o que realmente queria — não o que a ansiedade do momento queria."\n\n— EXERCÍCIO DESTA AULA —\n\nPARTE 1 — O INVENTÁRIO DE COMPRAS (10 minutos)\nOlhe para os últimos 30 dias de compras. Para cada compra não essencial, classifique: foi necessidade, desejo genuíno ou impulso? Sem julgamento. Apenas observação.\n\nPARTE 2 — IDENTIFIQUE SEUS GATILHOS (10 minutos)\nOlhando para as compras de impulso, pergunte: o que estava acontecendo quando eu comprei? Que emoção estava presente — tédio, ansiedade, tristeza, euforia, estresse?\n\nPARTE 3 — IMPLEMENTE UM PRINCÍPIO ESTA SEMANA\nEscolha um dos cinco princípios e aplique por 7 dias:\n• A regra do espaço\n• A espera de 72 horas\n• A pergunta das cinco vezes\n• Qualidade sobre quantidade\n• Um entra, um sai\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual emoção costuma preceder suas compras por impulso? O que isso revela sobre o papel que o consumo tem na sua vida emocional?\n2. Se você aplicasse a regra do espaço hoje, quantas compras recentes não teriam acontecido?\n3. Existe uma compra que você está considerando agora? Aplique a pergunta das cinco vezes e veja onde você chega.\n\n— PRÓXIMA AULA —\n\nA última aula desta trilha vai para algo que vai além dos objetos e além dos hábitos de consumo — vai para a identidade. Porque no fundo, a curadoria do que fica na sua casa é também uma curadoria de quem você é. E quando seu espaço reflete quem você realmente é, algo profundo se transforma.' },

{ title: 'Seu espaço, sua identidade', type: 'artigo', content: 'Chegamos à última aula da Trilha Simplificar. E ela é diferente das anteriores.\n\nNão vai te dar um método. Não vai te dar um checklist. Vai te convidar para uma reflexão mais profunda — sobre a relação entre o espaço que você habita e a pessoa que você é.\n\nPortanto no fundo, tudo que fizemos até aqui — organizar, simplificar, descartar, questionar o consumo — não era sobre a casa. Era sobre você.\n\n— O ESPAÇO COMO EXTENSÃO DA IDENTIDADE —\n\nA psicologia ambiental estuda a relação entre as pessoas e os espaços que habitam. Uma das descobertas mais consistentes é que os ambientes que criamos são extensões da nossa identidade — projeções físicas de quem somos, do que valorizamos, de onde estamos na vida.\n\nIsso acontece de duas direções:\n\nDO INTERIOR PARA O EXTERIOR — nossa identidade e nossos valores se manifestam no ambiente que criamos. Uma pessoa que valoriza conexão tende a criar espaços acolhedores para receber. Uma pessoa em transição frequentemente tem um espaço que reflete essa transição.\n\nDO EXTERIOR PARA O INTERIOR — o ambiente que habitamos também nos molda. Acordar todos os dias num espaço que não te representa cria uma dissonância silenciosa — uma sensação vaga de que algo não está certo, mesmo quando você não consegue nomear o quê.\n\nSeu espaço e sua identidade estão em conversa constante. A pergunta é: o que eles estão dizendo um ao outro?\n\n— O QUE SUA CASA DIZ SOBRE VOCÊ AGORA —\n\nImagine que uma amiga próxima entra na sua casa pela primeira vez. Sem nenhuma explicação da sua parte, ela olha ao redor. O que ela conclui sobre você?\n\nEssa conclusão reflete quem você realmente é hoje — ou reflete quem você era, quem os outros esperam que você seja, ou quem você ainda está tentando se tornar?\n\nMuitas casas carregam camadas de identidades superpostas:\n\nA IDENTIDADE DE UMA FASE QUE PASSOU — objetos de uma vida que não existe mais\nA IDENTIDADE DOS OUTROS — móveis herdados, decoração que agradou outra pessoa\nA IDENTIDADE ASPIRACIONAL — objetos de um estilo de vida que você imagina ter mas não vive\nA IDENTIDADE REAL — o que genuinamente te representa, te conforta, te inspira agora\n\nUm espaço com curadoria intencional tem principalmente a quarta camada — com espaço para elementos das outras, escolhidos conscientemente.\n\n— CURADORIA COMO ATO DE AUTOCONHECIMENTO —\n\nQuando você decide o que fica e o que vai, está fazendo mais do que organizar objetos. Está respondendo, repetidamente, a pergunta: quem sou eu agora?\n\nCada objeto que você mantém é uma afirmação. Cada objeto que você libera é uma despedida — de uma fase, de uma versão de si mesma, de uma expectativa que não é mais sua.\n\nA escritora Fumio Sasaki descreve esse fenômeno com precisão: "Quando paramos de nos definir pelos objetos que possuímos, descobrimos quem somos sem eles."\n\nVocê não é suas roupas. Não é seus móveis. Não é sua coleção. Mas o que você escolhe manter revela muito sobre o que você valoriza — e o que você libera abre espaço para o que ainda está por vir.\n\n— O QUE UM ESPAÇO QUE TE REPRESENTA PARECE —\n\nNão existe fórmula universal. Mas existem sinais de que um espaço está alinhado com quem você é:\n\nVocê entra e sente reconhecimento — não apenas familiaridade, mas reconhecimento. "Isso sou eu. Isso é meu lugar."\n\nOs objetos têm história ou função real — não estão ali por acaso, por inércia ou por convenção.\n\nO espaço te convida a ser quem você é — se você é introvertida, tem cantos de silêncio. Se você é criativa, tem espaço para criar. Se você valoriza conexão, tem espaço para receber.\n\nVocê não se envergonha do espaço — não no sentido de que precisa ser perfeito, mas no sentido de que não precisa pedir desculpas por ele.\n\nO espaço evolui com você — não ficou congelado numa versão passada.\n\n— CRIANDO ESPAÇOS DE SIGNIFICADO —\n\nAlguns elementos que transformam um espaço organizado em um espaço com alma:\n\nOBJETOS COM HISTÓRIA PESSOAL — a foto que te faz sorrir toda vez que passa por ela, o objeto trazido de uma viagem que importou, a peça herdada de alguém que você amou.\n\nELEMENTOS NATURAIS — plantas, pedras, madeira, luz natural. A natureza tem efeito comprovado de redução de estresse e aumento de bem-estar em ambientes internos.\n\nOBRAS OU OBJETOS DE BELEZA INTENCIONAL — não decoração genérica comprada porque estava em promoção, mas algo que genuinamente te toca.\n\nESPAÇOS DE PAUSA — um canto com uma poltrona confortável, uma área para tomar café em silêncio, um lugar que convida à leitura ou à contemplação.\n\nCHEIRO INTENCIONAL — o olfato é o sentido mais diretamente ligado à memória e à emoção. Uma vela, um difusor, plantas aromáticas — um cheiro que você associa ao bem-estar transforma instantaneamente a experiência de entrar num espaço.\n\n— UM EXEMPLO REAL —\n\nMônica, 44 anos, passou três anos num apartamento que ela descrevia como "funcional mas sem alma". Estava organizado — mas não a representava. Era neutro demais, genérico demais.\n\nQuando fizemos o exercício de identidade, ela percebeu que o apartamento refletia o gosto do ex-marido com quem tinha dividido o espaço por dez anos. Depois da separação, ela havia organizado, mas não havia reconquistado.\n\nEla trocou as cortinas por uma cor que sempre amou e que ele detestava. Colocou plantas — ele era alérgico. Montou um canto de leitura no lugar da televisão que ela nunca assistia. Pendurou fotos de viagens que fez sozinha.\n\n"A casa ficou mais eu. Não ficou mais bonita necessariamente — ficou mais honesta. E honesta é mais bonita do que perfeita."\n\n— EXERCÍCIO DESTA AULA —\n\nEste exercício não envolve mover nenhum objeto. É uma reflexão escrita.\n\nPARTE 1 — O INVENTÁRIO DE IDENTIDADE (15 minutos)\nResponda por escrito:\n• Quais são os três valores mais importantes para mim nesta fase da vida?\n• Como eu quero me sentir quando estou em casa?\n• Que tipo de pessoa estou me tornando — e o que ela precisa no seu ambiente?\n• Existe algo na minha casa que claramente não me representa mais?\n• Existe algo que está faltando que me representaria genuinamente?\n\nPARTE 2 — UMA MUDANÇA DE IDENTIDADE (nos próximos 7 dias)\nCom base nas respostas acima, faça uma mudança pequena e concreta que aproxime seu espaço de quem você é:\n• Colocar uma planta num espaço que estava vazio\n• Pendurar uma foto ou obra que te representa\n• Trocar um objeto genérico por algo com história pessoal\n• Criar um cantinho de pausa que ainda não existe\n• Remover algo que claramente não te pertence mais\n\nPequena. Concreta. Intencional.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Se sua casa fosse um retrato fiel de quem você é hoje, o que precisaria mudar? O que já está certo?\n2. Existe algum objeto na sua casa que pertence a uma versão passada de você — e que você está pronta para liberar?\n3. O que você quer que sua casa diga sobre você daqui a um ano — quando a travessia tiver avançado ainda mais?\n\n— TRILHA 3 CONCLUÍDA —\n\nTrês trilhas completas — Diagnosticar, Organizar, Simplificar. Você não apenas transformou espaços. Você começou a transformar a relação com o seu ambiente, com seus objetos, com seu consumo e com sua própria identidade.\n\nA Trilha Sustentar vai responder a pergunta que toda mulher que chega até aqui eventualmente faz: como eu mantenho isso? Não sobre criar mais sistemas — mas sobre fazer com que os sistemas que você já criou se mantenham vivos, mesmo nas semanas difíceis, mesmo quando a vida acontece, mesmo quando a motivação some. Porque sustentabilidade não é força de vontade. É design. 🌿' },
  ],
  '4': [

{ title: 'Por que os sistemas quebram (e como evitar)', type: 'artigo', content: 'Você já passou horas organizando um espaço, ficou satisfeita com o resultado — e duas semanas depois estava tudo exatamente como antes?\n\nSe isso já aconteceu com você, saiba: não foi falta de disciplina. Não foi preguiça. Foi porque você organizou sem criar um sistema — e sistemas são o que fazem a organização durar.\n\n— A DIFERENÇA ENTRE ORGANIZAÇÃO E SISTEMA —\n\nORGANIZAÇÃO é o estado de um espaço em um momento específico. É o resultado de uma ação — arrumei, organizei, transformei. É o "antes e depois" que você fotografa e que dura enquanto ninguém tocar em nada.\n\nSISTEMA é o conjunto de regras, estruturas e hábitos que fazem a organização se manter ao longo do tempo, com mínimo esforço consciente. É o que acontece depois da foto.\n\nOrganização sem sistema é como encher um balde furado. Você pode encher quantas vezes quiser — o resultado é sempre o mesmo. O sistema é o que tampa o furo.\n\nA diferença na prática:\n• Organizar o closet = estado temporário\n• Sistema de saída permanente + hábito de guardar roupas antes de dormir = estado sustentável\n\n• Limpar a bancada = estado temporário\n• Regra de bancada livre + reset noturno de 5 minutos = estado sustentável\n\nO objetivo desta trilha não é te motivar a organizar mais. É te ajudar a projetar sistemas tão bem que a organização se mantenha quase sozinha.\n\n— OS TRÊS MOTIVOS PELOS QUAIS OS SISTEMAS QUEBRAM —\n\nMOTIVO 1 — O SISTEMA É COMPLEXO DEMAIS\nQualquer sistema que exige mais de três passos para ser executado será abandonado nos dias difíceis. E os dias difíceis são inevitáveis.\n\nSistemas sustentáveis precisam ser mais fáceis de seguir do que de ignorar. Quando seguir o sistema é o caminho de menor resistência, ele sobrevive até nos dias mais difíceis.\n\nMOTIVO 2 — O SISTEMA NÃO FOI FEITO PARA A SUA VIDA REAL\nEsse é o erro mais comum de quem busca inspiração em perfis de organização nas redes sociais. Um sistema criado para uma pessoa que mora sozinha, sem filhos, com muito tempo livre, não vai funcionar para uma mãe de três filhos com rotina intensa.\n\nSistemas eficazes são criados para a vida real — com suas limitações reais, seu tempo real, sua energia real, sua família real.\n\nMOTIVO 3 — NÃO HÁ RITUAIS DE RESET\nTodo sistema precisa de momentos planejados de manutenção. Sem um reset periódico, pequenas desordens se acumulam progressivamente até o ponto de ruptura.\n\nO reset não precisa ser grande. Pode ser 10 minutos todas as noites. Pode ser 30 minutos toda semana. O que importa é que existe — planejado, previsível, parte da rotina.\n\n— COMO PROJETAR SISTEMAS QUE DURAM —\n\nUm bom sistema tem quatro características:\n\nÓBVIO — qualquer pessoa, sem instrução, consegue entender e seguir. Quando o sistema precisa ser explicado, ele depende de você para funcionar.\n\nFÁCIL — menos passos que a alternativa. Guardar a roupa no lugar certo deve ser mais fácil do que deixar na cadeira. Se não for, a cadeira vai ganhar sempre.\n\nATRAENTE — esteticamente agradável o suficiente para que seguir o sistema seja prazeroso, não apenas funcional.\n\nRESILIENTE — funciona mesmo quando não é seguido perfeitamente. Um bom sistema aguenta dois, três dias de abandono e se recupera rapidamente.\n\n— O DIAGNÓSTICO DOS SISTEMAS QUE JÁ EXISTEM —\n\nPara cada área da sua casa, pergunte:\n\nCOMO A DESORDEM VOLTA? Observe o padrão. A bancada acumula porque não há um destino claro para o que chega. O closet acumula porque guardar roupa exige mais passos do que deixar na cadeira.\n\nO SISTEMA ATUAL É MAIS FÁCIL QUE A ALTERNATIVA DESORDENADA? Se não for, o sistema vai perder sempre. A fricção precisa estar do lado da desordem, não da organização.\n\nQUEM MAIS PRECISA SEGUIR ESSE SISTEMA? Se depende de comportamentos de outras pessoas, precisa ser especialmente óbvio e fácil. Sistemas que só funcionam quando você está presente não são sistemas — são trabalho seu.\n\n— UM EXEMPLO REAL —\n\nJuliana, 39 anos, tinha reorganizado a cozinha três vezes nos últimos dois anos. Todas as vezes, o mesmo resultado: em três semanas, tudo voltava ao estado anterior.\n\nO problema ficou claro: o sistema dela era complexo demais. Categorias elaboradas, etiquetas em tudo, uma sequência específica de onde cada coisa ficava. Era lindo. Era impossível de manter no ritmo da sua vida real.\n\nA solução foi simplificar radicalmente. Três regras, não trinta:\n1. A bancada fica livre — qualquer coisa que não é de uso diário vai para um armário\n2. Cada item tem um armário, não um lugar específico dentro do armário\n3. Reset de 5 minutos antes de dormir — só a bancada\n\nQuatro meses depois, a cozinha ainda estava funcionando. "Não está perfeita como quando eu reorganizei. Mas está funcionando todo dia — e funcionando todo dia é melhor do que perfeito uma vez por mês."\n\n— EXERCÍCIO DESTA AULA —\n\nEscolha o sistema que mais frequentemente falha na sua casa. Responda por escrito:\n\n1. Como a desordem volta nesse espaço? Descreva o padrão específico.\n2. O sistema atual tem quantos passos? Se tem mais de três, simplifique até ter dois ou menos.\n3. O sistema é mais fácil que a alternativa desordenada? Se não for, o que precisaria mudar?\n4. Qual seria o ritual de reset mínimo para esse espaço? Não o ideal — o mínimo viável.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual sistema da sua casa mais frequentemente falha? Qual dos três motivos de falha mais se aplica a ele?\n2. Existe um sistema que funciona bem na sua casa — que se mantém quase sozinho? O que ele tem de diferente dos que falham?\n3. Se você pudesse simplificar um sistema para ter no máximo dois passos, qual seria — e como ficaria?\n\n— PRÓXIMA AULA —\n\nAgora que você entende por que os sistemas quebram e como projetá-los para durar, a próxima aula vai para o momento do dia que tem mais impacto na sustentabilidade de tudo: a manhã. Porque a forma como você começa o dia define, em grande parte, como o restante dele se desdobra — e como a casa se comporta enquanto você vive nela.' },

{ title: 'A rotina matinal que muda tudo', type: 'checklist', content: 'Existe um princípio que aparece consistentemente na pesquisa sobre hábitos, produtividade e bem-estar: o que você faz nas primeiras horas do dia tem um impacto desproporcional em como o restante dele se desdobra.\n\nNão porque existe magia nas manhãs. Mas porque a manhã é o momento em que sua reserva de energia, foco e autocontrole está mais cheia — antes de ser consumida pelas demandas, decisões e imprevistos do dia.\n\n— O MITO DA ROTINA MATINAL PERFEITA —\n\nVocê provavelmente já viu: acordar às 4h30, meditação de 30 minutos, exercício de 1 hora, diário, leitura, café da manhã elaborado — tudo antes das 8h. Para a maioria das mulheres com filhos, trabalho e vida real, parece completamente impossível.\n\nE é. Para a maioria das pessoas, na maioria dos dias.\n\nO que a pesquisa sobre hábitos realmente mostra: não é a extensão da rotina matinal que importa — é a consistência e a intenção. Uma rotina de 20 minutos praticada todos os dias supera uma rotina de 2 horas praticada quando a vida permite.\n\n— A PREPARAÇÃO DA NOITE ANTERIOR —\n\nA rotina matinal mais eficiente começa 8 a 12 horas antes — na noite anterior. Quando você prepara elementos da manhã na noite anterior, remove decisões e fricções do momento em que sua energia é menor.\n\n🌙 ROUPAS SEPARADAS — a batalha do closet às 7h começa e termina na noite anterior. Separe a roupa completa — incluindo acessórios e sapatos — antes de dormir.\n\n🌙 BOLSA E PERTENCES ORGANIZADOS — chaves no lugar, carteira completa, o que você vai precisar amanhã já pronto.\n\n🌙 COZINHA EM ORDEM — a louça lavada, a bancada limpa. Acordar com a cozinha em ordem é acordar com uma decisão já tomada a seu favor.\n\n🌙 AGENDA DO DIA SEGUINTE REVISADA — saber o que vem pela frente antes de dormir permite que o cérebro processe durante o sono.\n\n🌙 TELA DESLIGADA 30 A 60 MINUTOS ANTES — o sono que antecede a manhã define a qualidade da manhã.\n\n— CHECKLIST DA MANHÃ LEVE —\n\nEscolha dois ou três itens para começar. Pratique por duas semanas até se tornarem automáticos. Depois adicione o próximo. Nunca adicione um novo hábito antes de o anterior estar consolidado.\n\nPRIMEIROS 5 MINUTOS — antes de qualquer tela\n\n✅ Abrir as janelas ou cortinas — luz natural nos primeiros minutos sinaliza ao cérebro que o dia começou e regula o ritmo circadiano.\n\n✅ Fazer a cama — leva menos de 3 minutos e transforma imediatamente a energia do quarto. Uma pequena vitória completada antes de qualquer outra coisa.\n\n✅ Um copo d\'água antes de qualquer outra coisa — seu corpo passa 6 a 8 horas sem hidratação durante o sono.\n\nPRIMEIROS 15 MINUTOS — o ritmo do dia\n\n✅ Preparar o café ou chá com atenção — não no piloto automático, mas como um ritual de alguns minutos de presença.\n\n✅ Sentar para tomar o café da manhã — sem tela, sem notificação. Mesmo que sejam 10 minutos. Sentar muda a experiência inteira.\n\n✅ Uma micro-tarefa de organização de 5 minutos — uma superfície, uma gaveta, devolver algo ao lugar. Uma micro-vitória que ativa o modo de ação.\n\nA INTENÇÃO DO DIA\n\n✅ Definir uma palavra ou frase para o dia — não uma lista de tarefas. Uma intenção. "Presença." "Calma." "Foco no essencial." "Gentileza comigo mesma."\n\n✅ Identificar a tarefa mais importante do dia — a uma que, se feita, vai fazer o dia valer a pena independente do que mais aconteça.\n\nO QUE EVITAR NAS PRIMEIRAS HORAS\n\n❌ Celular nos primeiros 30 minutos — coloca você imediatamente em modo de resposta às demandas dos outros.\n❌ Notícias logo ao acordar — ativa emoções fortes que podem persistir por horas.\n❌ Discussões ou conversas difíceis — as primeiras horas são para construir seu estado mental.\n❌ Verificar e-mail antes de ter sua primeira hora — e-mail é a agenda dos outros para o seu tempo.\n\n— A MANHÃ NOS DIAS DIFÍCEIS —\n\nHaverá dias em que a rotina matinal vai por água abaixo. Nesses dias, não tente manter a rotina completa. Escolha uma coisa — uma única coisa — para ancorar o dia. Pode ser apenas abrir a janela. Pode ser apenas a cama feita.\n\nUma âncora mínima é suficiente para criar um fio de intenção num dia difícil. A rotina matinal não precisa ser perfeita para funcionar. Precisa ser consistente — mesmo que a consistência, nos dias difíceis, signifique apenas um gesto.\n\n— UM EXEMPLO REAL —\n\nVanessa, 36 anos, dizia que "não era pessoa de manhã". Acordava no último minuto, saía sempre com pressa, chegava ao trabalho já exausta e reativa.\n\nO problema estava na véspera: ela nunca preparava nada na noite anterior. Roupa decidida às 7h20. Bolsa procurada às 7h35. Café tomado em pé às 7h45 verificando mensagens.\n\nA mudança foi pequena: durante duas semanas, apenas duas coisas — separar a roupa na noite anterior e não pegar o celular antes de tomar o café.\n\n"A segunda semana eu percebi que estava chegando ao trabalho diferente. Não mais calma — mas mais inteira. Menos no modo de sobrevivência." Quatro meses depois, sua rotina matinal tem 25 minutos. Ela não a chama mais de rotina matinal — chama de "meu tempo antes do dia começar".\n\n— EXERCÍCIO DESTA AULA —\n\nPASSO 1 — Avalie sua manhã atual\nComo são suas manhãs hoje, honestamente? Descreva em três frases o que geralmente acontece desde que você acorda até começar o dia.\n\nPASSO 2 — Identifique o maior ponto de atrito\nQual é o momento da manhã que mais frequentemente gera estresse ou sensação de derrota? Esse é o seu ponto de partida.\n\nPASSO 3 — Escolha dois elementos para começar\nDo checklist desta aula, escolha dois — apenas dois — para implementar nos próximos 14 dias. Escreva quais são e em que horário específico vão acontecer.\n\nPASSO 4 — Prepare a noite anterior\nEsta noite, antes de dormir, implemente pelo menos um dos elementos de preparação noturna. Amanhã de manhã, observe a diferença.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Como você descreveria o tom emocional das suas manhãs atuais — reativo, neutro ou intencional?\n2. Qual elemento da preparação noturna teria mais impacto imediato na sua manhã de amanhã?\n3. Existe algo que você faz de manhã que consome energia desproporcional ao seu valor real?\n\n— PRÓXIMA AULA —\n\nCom a manhã ancorada em intenção, a próxima aula vai para a prática semanal que mais impacta a sustentabilidade da organização ao longo do tempo: o reset semanal. Você vai aprender por que 20 a 30 minutos por semana podem substituir horas de reorganização por mês.' },

{ title: 'O reset semanal', type: 'artigo', content: 'Se você pudesse adotar apenas uma prática desta trilha inteira — uma única coisa — que tivesse o maior impacto na sustentabilidade da sua organização ao longo do tempo, seria esta.\n\nO reset semanal.\n\nA lógica é simples: toda casa acumula pequenas desordens ao longo da semana. Não porque as pessoas são desorganizadas — mas porque a vida acontece. O reset semanal é a manutenção preventiva que impede que essas pequenas desordens se acumulem até o ponto de ruptura.\n\n— A MATEMÁTICA DA MANUTENÇÃO —\n\nSEM RESET SEMANAL:\nPequenas desordens acumulam por 2 a 4 semanas → ponto de ruptura → reorganização de 3 a 6 horas → ciclo recomeça\n\nCOM RESET SEMANAL:\n25 minutos por semana → desordens interceptadas antes de acumular → sem ponto de ruptura → sem reorganizações de emergência\n\nEm um mês: 4 resets de 25 minutos = 100 minutos de manutenção, versus uma reorganização de emergência de 4 horas = 240 minutos de trabalho reativo.\n\nO reset semanal não é um gasto de tempo. É um investimento que retorna mais do que consome.\n\n— O QUE O RESET SEMANAL NÃO É —\n\nNão é faxina — você não vai lavar nada, não vai limpar superfícies, não vai passar aspirador.\nNão é reorganização — você não vai criar novos sistemas nem mudar nada de lugar.\nNão é um evento de fim de semana — 20 a 30 minutos é suficiente quando feito semanalmente.\nNão é opcional quando a semana foi pesada — nas semanas mais intensas, é especialmente importante.\n\n— A SEQUÊNCIA DO RESET SEMANAL BRIDGE —\n\nETAPA 1 — O PERCURSO RÁPIDO (5 a 7 minutos)\nPegue uma cesta grande. Percorra toda a casa — todos os cômodos, na mesma ordem sempre — e colete tudo que está fora do lugar. Não guarde ainda. Apenas colete.\n\nRegras do percurso:\n• Não entre em projetos. Se encontrar uma gaveta bagunçada, não abra.\n• Não fique parada mais de 10 segundos em nenhum lugar.\n• Colete apenas o que está visivelmente fora do lugar.\n\nAo terminar, distribua o conteúdo da cesta pelos cômodos corretos.\n\nETAPA 2 — PAPÉIS E PENDÊNCIAS (5 minutos)\nVá até a Caixa de Entrada de documentos. Faça a triagem rápida: o que vai para Ação, o que vai para arquivo, o que é descarte imediato. Não resolva as ações agora — apenas classifique.\n\nETAPA 3 — COZINHA E DESPENSA (5 minutos)\n• Há algo na bancada que não deveria estar ali? Guarde.\n• O que está acabando e precisa entrar na lista de compras? Anote.\n• Há algo na geladeira que precisa ser usado antes de estragar? Note para o planejamento de refeições.\n\nETAPA 4 — QUARTO E CLOSET (3 a 5 minutos)\n• Roupas na cadeira? Guardem no lugar certo ou na cesta de roupas sujas.\n• Superfícies do quarto com itens que não pertencem ali? Devolva.\n• A cesta de saída permanente do closet está cheia? Programe a doação.\n\nETAPA 5 — O PLANEJAMENTO DA SEMANA (5 a 10 minutos)\nCom a casa em ordem ao seu redor, olhe para a semana que vem:\n\n📅 COMPROMISSOS — o que está na agenda? Há algo que precisa de preparação antecipada?\n🍽️ REFEIÇÕES — o que você vai cozinhar essa semana? Planejar agora elimina sete decisões diárias.\n🛒 COMPRAS — baseado na varredura da cozinha e no planejamento de refeições, o que precisa ser comprado?\n⚡ A SEMANA EM PERSPECTIVA — o que é mais importante? O que pode ser delegado? O que pode ser eliminado?\n\n— QUANDO FAZER O RESET SEMANAL —\n\nO momento ideal é aquele que você vai realmente fazer. Algumas opções que funcionam bem:\n\nDOMINGO À TARDE OU NOITE — permite começar a segunda-feira com leveza.\nSEXTA À NOITE — fecha a semana e permite que o fim de semana comece em ordem.\nSÁBADO DE MANHÃ — para quem tem mais energia no início do fim de semana.\n\nO que não funciona: "quando eu tiver tempo" ou "quando a casa precisar". O reset semanal precisa de um dia e horário fixos — tratado como compromisso, não como tarefa opcional.\n\n— O RESET COM A FAMÍLIA —\n\nUma estrutura simples que funciona:\n• Você faz o percurso geral e o planejamento\n• Parceiro ou filhos mais velhos fazem a varredura dos seus próprios espaços\n• Crianças menores têm uma tarefa específica e simples\n\nO que importa não é a perfeição da execução de cada um — é que o reset deixa de ser responsabilidade de uma pessoa só.\n\n— UM EXEMPLO REAL —\n\nCamila, 42 anos, vivia num ciclo que ela mesma descrevia como "organizo no sábado, desfaço na semana, entro em colapso no sábado seguinte."\n\nQuando implementou o reset semanal — toda segunda-feira às 21h, depois que os filhos dormiam — algo mudou. "A primeira semana foi 40 minutos. A segunda foi 28. Na terceira foi 22. Agora faço em 20 minutos e ainda sobra tempo."\n\n"Eu não parei de ter semanas caóticas. A vida continuou igual. Mas o reset impede que o caos se acumule além de um certo ponto. É como se tivesse um teto para a desordem."\n\n— EXERCÍCIO DESTA AULA —\n\nPASSO 1 — Escolha seu dia e horário\nDecida agora: qual dia e qual horário você vai fazer o reset? Escreva. Coloque na agenda. Trate como compromisso fixo.\n\nPASSO 2 — Prepare sua cesta de reset\nEscolha uma cesta dedicada ao percurso semanal. Deixe num lugar acessível e visível.\n\nPASSO 3 — Faça o primeiro reset esta semana\nNão espere a semana perfeita. Faça esta semana, mesmo que a casa esteja mais acumulada do que o normal.\n\nPASSO 4 — Registre quanto tempo levou\nAnote o tempo do primeiro reset. Na semana seguinte, compare. Observar a redução progressiva é uma das formas mais motivadoras de perceber que o sistema está funcionando.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Você já tentou alguma prática de manutenção semanal antes? O que funcionou e o que não funcionou?\n2. Qual etapa do reset semanal você acha que vai ser mais fácil de manter — e qual vai exigir mais intenção?\n3. Existe alguém na sua casa que poderia participar do reset? Como você poderia distribuir as responsabilidades?\n\n— PRÓXIMA AULA —\n\nCom o reset semanal como âncora da sua semana, a próxima aula vai tratar de uma das fontes mais frequentes de frustração para mulheres que se organizam: a sensação de estar sozinha nesse trabalho. Você vai aprender como criar sistemas que funcionam para toda a família — e como envolver as pessoas que vivem com você sem transformar isso numa fonte de conflito.' },

{ title: 'Envolvendo a família na organização', type: 'artigo', content: 'Você criou sistemas. Organizou espaços. Fez resets. Manteve a intenção mesmo nas semanas difíceis.\n\nE ainda assim, às vezes, parece que você está remando sozinha num barco onde todos os outros estão jogando coisas para dentro da água.\n\nEssa sensação é uma das mais comuns e mais desgastantes entre as mulheres que passam por este processo. E ela raramente é sobre mal-caráter ou falta de amor das pessoas que vivem com você. É sobre sistemas que não foram projetados para funcionar para todos — apenas para você.\n\n— POR QUE A FAMÍLIA NÃO SEGUE OS SISTEMAS —\n\nO SISTEMA É INVISÍVEL PARA QUEM NÃO O CRIOU\nQuando você organiza a casa, você cria uma lógica completamente visível para você e completamente invisível para os outros. Seu parceiro não deixa as chaves em lugar aleatório porque não se importa. Deixa porque, para ele, não existe um "lugar certo" — o sistema existe na sua cabeça, não no ambiente.\n\nNINGUÉM FOI ENVOLVIDO NA CRIAÇÃO\nPessoas seguem sistemas que ajudaram a criar. Quando o sistema é imposto — mesmo com boa intenção — a adesão é baixa. Não por resistência ativa, mas por falta de senso de pertencimento ao sistema.\n\nAS EXPECTATIVAS NÃO FORAM COMUNICADAS\n"Eu queria que eles soubessem" é uma das frases mais comuns — e mais custosas — nas dinâmicas domésticas. Expectativas não comunicadas criam ressentimento de um lado e confusão do outro.\n\nOS SISTEMAS EXIGEM MAIS ESFORÇO DO QUE A ALTERNATIVA\nSe guardar algo no lugar certo exige abrir duas portas e reorganizar outras coisas — e a alternativa é simplesmente deixar na bancada — a bancada vai ganhar sempre. Para todos.\n\n— A CARGA MENTAL INVISÍVEL —\n\nEm muitas casas, a organização doméstica ainda é percebida, mesmo que implicitamente, como responsabilidade primária da mulher. O resultado é uma distribuição desigual não apenas do trabalho físico, mas da carga mental — o esforço de perceber o que precisa ser feito, planejar como fazer e gerenciar o processo.\n\nVocê percebe que o papel higiênico está acabando. Você lembra que o filho tem consulta na quinta. Você nota que a geladeira está vazia. Você gerencia a logística invisível da casa enquanto também executa grande parte do trabalho visível.\n\nIsso não é sustentável. E não é justo.\n\n— COMO CRIAR SISTEMAS QUE FUNCIONAM PARA TODOS —\n\nESTRATÉGIA 1 — TORNE O SISTEMA ÓBVIO\nQualquer pessoa, sem instrução prévia, deve conseguir encontrar qualquer objeto e devolvê-lo ao lugar certo.\n\n• Cestos abertos em vez de caixas fechadas — o que é visível é guardado\n• Etiquetas em prateleiras e cestos — especialmente para áreas compartilhadas\n• Menos categorias, mais espaço — sistemas com muitas subdivisões confundem\n• Zonas por tipo de uso, não por objeto\n\nESTRATÉGIA 2 — ENVOLVA NA CRIAÇÃO, NÃO APENAS NA EXECUÇÃO\nAntes de organizar um espaço compartilhado, converse com as pessoas que usam esse espaço. Não "vou organizar a sala, ok?" — mas "onde você acha que faz mais sentido guardar os controles?"\n\nQuando as pessoas participam da decisão de onde as coisas ficam, têm muito mais chance de devolver as coisas para lá.\n\nESTRATÉGIA 3 — DEFINA RESPONSABILIDADES POR ESPAÇO, NÃO POR TAREFA\n"Me ajuda mais em casa" é vago e raramente gera mudança. "Você é responsável pela organização do banheiro" é uma responsabilidade clara.\n\nA responsabilidade inclui perceber e agir — não apenas executar quando lembrado. Crianças a partir de 4 anos podem ter responsabilidades adaptadas à idade.\n\nESTRATÉGIA 4 — CRIE RITUAIS COLETIVOS, NÃO COBRANÇAS INDIVIDUAIS\nA diferença entre "por que você nunca guarda nada?" e "vamos fazer o reset juntos às 20h?" é a diferença entre conflito e sistema.\n\nRituais coletivos funcionam porque tiram a cobrança da equação, criam pertencimento e são previsíveis — todos sabem o que esperar e quando.\n\nESTRATÉGIA 5 — RECONHEÇA, NÃO CRITIQUE\nCrítica constante gera resistência. Reconhecimento gera repetição.\n\nQuando alguém seguir o sistema — mesmo que imperfeitamente — reconheça genuinamente. E quando o sistema não for seguido, corrija o ambiente, não a pessoa. Quando o ambiente não suporta o comportamento, mudar o ambiente é mais eficaz do que mudar a pessoa.\n\n— A CONVERSA DIFÍCIL SOBRE DISTRIBUIÇÃO DESIGUAL —\n\nSe você está carregando a maior parte da carga doméstica, essa conversa precisa acontecer. Não como acusação, mas como necessidade genuína.\n\n• Torne o invisível visível — faça uma lista de tudo que você gerencia e executa. Mostre. Não para culpar, mas para criar consciência.\n• Fale em impacto, não em comportamento — não "você nunca ajuda" mas "quando eu carrego tudo sozinha, fico exausta — e isso afeta nossa relação."\n• Proponha soluções, não apenas problemas — venha com ideias concretas de redistribuição.\n• Seja paciente com a curva de aprendizado — pessoas que nunca perceberam certas necessidades não vão perceber da noite para o dia.\n\n— UM EXEMPLO REAL —\n\nPatrícia, 40 anos, sentia que a casa estava sempre em ordem quando ela estava presente e em caos quando não estava. Viagens a trabalho eram seguidas de fins de semana de reorganização.\n\nO problema tinha dois componentes: o marido e os filhos não sabiam onde as coisas ficavam — o sistema estava na cabeça dela — e nunca havia sido pedido a eles que se responsabilizassem por espaços específicos.\n\nA solução foi em duas etapas: tornar o sistema visível com etiquetas e cestos abertos, e uma conversa onde cada pessoa escolheu um espaço para ser responsável.\n\n"A primeira semana foi imperfeita. A segunda semana foi melhor. No primeiro mês, eu viajei e voltei para uma casa que não estava perfeita — mas estava funcional. Pela primeira vez."\n\n— EXERCÍCIO DESTA AULA —\n\nPARTE 1 — O MAPA DE RESPONSABILIDADES ATUAL\nFaça uma lista honesta de todas as responsabilidades domésticas — físicas e de gestão mental — e quem as executa atualmente. Inclua as invisíveis: lembrar, perceber, planejar, gerenciar.\n\nPARTE 2 — A REDISTRIBUIÇÃO POSSÍVEL\nOlhando para a lista, identifique:\n• O que poderia ser redistribuído para o parceiro?\n• O que poderia ser responsabilidade dos filhos, adaptado à idade?\n• O que poderia ser simplificado ou eliminado?\n\nPARTE 3 — UMA CONVERSA E UM SISTEMA\nEsta semana, tenha uma conversa sobre distribuição com as pessoas que vivem com você — não como cobrança, mas como proposta. E implemente um sistema óbvio em um espaço compartilhado.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual é a maior fonte de frustração quando se trata de organização compartilhada na sua casa? É um problema de sistema, de comunicação ou de distribuição?\n2. Existe alguém na sua casa que você nunca pediu para assumir uma responsabilidade específica — mas que poderia?\n3. Se as pessoas que vivem com você descrevessem o sistema de organização da casa, o que elas diriam? Elas sabem onde as coisas ficam?\n\n— PRÓXIMA AULA —\n\nA última aula desta trilha vai para algo que sabota silenciosamente mais travessias do que qualquer falta de sistema: o perfeccionismo. Você vai entender por que a busca pela casa perfeita é, paradoxalmente, o maior inimigo da casa organizada — e como cultivar a mentalidade do progresso que sustenta a transformação a longo prazo.' },

{ title: 'Celebrando o progresso, não a perfeição', type: 'artigo', content: 'Chegamos à última aula da Trilha Sustentar. E ela vai tratar do inimigo mais silencioso e mais poderoso de toda transformação sustentável.\n\nNão é a falta de tempo. Não é a família que não colabora. É o perfeccionismo.\n\nO perfeccionismo se disfarça de padrão elevado. Se apresenta como exigência saudável consigo mesma. Mas na prática funciona como sabotagem silenciosa.\n\n— COMO O PERFECCIONISMO FUNCIONA NA ORGANIZAÇÃO —\n\nTUDO OU NADA\nO perfeccionismo opera em binário: ou a casa está perfeita, ou está uma bagunça. Não existe meio-termo aceitável. Uma mulher perfeccionista não começa a organizar a gaveta porque sabe que não vai ter tempo de terminar perfeitamente. Então não começa nada. A gaveta fica bagunçada por meses enquanto ela espera o momento perfeito que nunca chega.\n\nA COMPARAÇÃO EXTERNA\nAs redes sociais amplificaram o perfeccionismo doméstico de forma sem precedentes. O que não mostram: as horas de preparação para a foto, o ângulo que esconde a bagunça fora do quadro, e que aquelas casas provavelmente não se parecem com aquelas fotos na segunda-feira de manhã com duas crianças e uma semana pesada.\n\nA META MOVENTE\nO perfeccionismo tem uma característica cruel: a meta nunca está completamente atingida. Você organiza o quarto — mas o banheiro ainda está bagunçado. Não existe um ponto de chegada onde o perfeccionista declara vitória. Existe apenas uma lista infinita de imperfeições restantes.\n\nA PARALISIA PELA ANÁLISE\nAntes de começar, o perfeccionismo questiona tudo: qual é o sistema certo? Qual é a melhor cesta? Qual é o momento ideal? A análise infinita se torna uma forma sofisticada de procrastinação.\n\n— DE ONDE VEM O PERFECCIONISMO DOMÉSTICO —\n\nA pesquisadora Brené Brown oferece uma perspectiva transformadora: "O perfeccionismo não é sobre ter padrões elevados. É sobre tentar ganhar aprovação."\n\nNo contexto doméstico feminino, existe uma carga cultural histórica que associa a qualidade da casa à competência da mulher que a habita. Uma casa bagunçada não é apenas uma casa bagunçada — é, num imaginário coletivo ainda muito vivo, um reflexo de quem você é como mulher, mãe, esposa.\n\nReconhecer isso não resolve automaticamente o perfeccionismo. Mas cria compaixão com si mesma — e compaixão é o solo onde a mudança real cresce.\n\n— A ALTERNATIVA: A MENTALIDADE DO PROGRESSO —\n\nA mentalidade do progresso não é desleixo, não é baixar o padrão. É uma mudança fundamental na métrica de avaliação.\n\nO perfeccionismo avalia em relação ao ideal — e sempre encontra deficiência.\nA mentalidade do progresso avalia em relação ao ponto de partida — e quase sempre encontra avanço.\n\nA mesma casa, avaliada pelos dois critérios:\n\nCOM PERFECCIONISMO: "A sala ainda está bagunçada, o banheiro precisa de atenção, o closet não está como deveria. Não consegui fazer o suficiente."\n\nCOM MENTALIDADE DO PROGRESSO: "Essa semana fiz o reset duas vezes, organizei a gaveta da cozinha que estava há meses bagunçada, e dormi melhor do que no mês passado. Estou avançando."\n\nA realidade é a mesma. A experiência é completamente diferente.\n\n— O PADRÃO DO "BOM O SUFICIENTE" —\n\nUma casa "boa o suficiente" todos os dias supera, em qualidade de vida real, uma casa perfeita uma vez por mês.\n\nUm reset semanal "bom o suficiente" — 15 minutos em vez de 30, parcialmente feito em vez de completamente — supera o reset perfeito que não acontece porque as condições nunca estão ideais.\n\n"Bom o suficiente" não é resignação. É sabedoria prática sobre como as coisas realmente funcionam no longo prazo.\n\n— COMO CULTIVAR A MENTALIDADE DO PROGRESSO —\n\nPRÁTICA 1 — DOCUMENTE A JORNADA, NÃO APENAS O DESTINO\nTire fotos ao longo do processo — não apenas do resultado final. Essas fotos têm um poder que a memória não tem: elas são objetivas. Quando você está num dia difícil e sente que não avançou nada, as fotos mostram o que realmente mudou.\n\nPRÁTICA 2 — CELEBRE O QUE FUNCIONOU, NÃO APENAS O QUE FALTOU\nNo final de cada semana, responda uma única pergunta: o que funcionou esta semana? Treinar o cérebro a perceber o que avança — não apenas o que falta — é uma habilidade que se desenvolve com prática deliberada.\n\nPRÁTICA 3 — REDEFINA O QUE "ORGANIZADA" SIGNIFICA PARA VOCÊ\nNão para os outros. Para você — na sua casa, com sua família, no seu ritmo de vida. Escreva uma definição. Essa definição se torna seu critério de avaliação — não a foto do perfil de organização que você salvou no Instagram.\n\nPRÁTICA 4 — PRATIQUE A INTERRUPÇÃO DO PENSAMENTO PERFECCIONISTA\nQuando perceber o pensamento perfeccionista se instalando, questione-o: é verdade? Comparado ao quê? Ao ideal ou ao ponto de partida? Muitas vezes, o pensamento perfeccionista não sobrevive ao questionamento honesto.\n\nPRÁTICA 5 — NOS DIAS DE COLAPSO, VOLTE AO MÍNIMO\nHaverá semanas em que tudo vai por água abaixo. A mentalidade perfeccionista diz: "fracassei, preciso recomeçar do zero." A mentalidade do progresso diz: "qual é o menor passo que posso dar agora para voltar ao caminho?"\n\nO menor passo. Não o passo perfeito — o menor passo possível.\n\n— UM EXEMPLO REAL —\n\nMariana, 38 anos, tinha reorganizado a casa três vezes em dois anos — e nas três vezes, desistido dentro de um mês. O padrão era sempre o mesmo: começava com energia máxima, tinha uma semana difícil, concluía que havia "falhado" e abandonava tudo.\n\nA causa estava clara: o critério de sucesso era a perfeição. A mudança foi redefinir o critério. Em vez de "mantive a casa perfeita esta semana?", a pergunta passou a ser "o que funcionou esta semana?"\n\nNa primeira semana da mudança, ela teve uma semana difícil. Mas quando respondeu à nova pergunta, encontrou três coisas que funcionaram.\n\n"Eu teria chamado essa semana de fracasso antes. Agora eu vejo que foi uma semana imperfeita com progresso real. São coisas muito diferentes."\n\nDez meses depois, ainda está no caminho. Não com uma casa perfeita — com uma casa em progresso constante.\n\n— EXERCÍCIO DESTA AULA —\n\nPARTE 1 — O INVENTÁRIO DO PERFECCIONISMO (10 minutos)\n• Em que momentos o perfeccionismo aparece mais na sua relação com a casa?\n• Que pensamentos específicos ele produz?\n• Quais ações ele impede ou sabota?\n\nPARTE 2 — REDEFINA SEU CRITÉRIO (10 minutos)\nEscreva sua definição pessoal de "casa organizada o suficiente" — baseada na sua realidade, não no ideal. Específica o suficiente para ser avaliável, flexível o suficiente para sobreviver às semanas difíceis.\n\nPARTE 3 — A PERGUNTA SEMANAL\nA partir desta semana, toda vez que fizer o reset semanal, responda por escrito: "O que funcionou esta semana?" Guarde as respostas — elas vão contar a história do seu progresso ao longo do tempo.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Em que área da sua vida o perfeccionismo aparece com mais força — e como ele se manifesta na organização da casa?\n2. Qual seria sua definição pessoal de "casa organizada o suficiente"?\n3. Olhando para os últimos meses da sua travessia, o que mudou? Não em relação ao ideal — em relação ao ponto de partida?\n\n— TRILHA 4 CONCLUÍDA —\n\nVocê aprendeu a criar sistemas que duram, a estabelecer rituais que sustentam, a envolver as pessoas ao seu redor e a cultivar a mentalidade que faz a transformação durar além da motivação inicial.\n\nHá uma última trilha. E ela é diferente de todas as outras.\n\nA Trilha Florescer não vai te ensinar a organizar nada. Vai te convidar a habitar com plenitude o espaço que você transformou. A criar rituais de bem-estar que nutrem em vez de apenas funcionar. A descobrir o que significa, para você, viver com leveza, intenção e presença plena.\n\nPorque uma casa organizada é o meio — nunca o fim. O fim é a vida que acontece dentro dela. 🌸' },
  ],
  '5': [

{ title: 'Quando a casa vira lar', type: 'artigo', content: 'Você chegou à última trilha.\n\nPense por um momento no caminho percorrido. Você diagnosticou. Organizou. Simplificou. Criou sistemas. Aprendeu a sustentar. Agora começa algo diferente.\n\nA Trilha Florescer não vai te pedir para reorganizar nenhuma gaveta. Vai te convidar para uma conversa mais profunda — sobre o que significa, de verdade, habitar um espaço com plenitude.\n\n— A DIFERENÇA ENTRE CASA E LAR —\n\nUma casa organizada é funcional. Os objetos têm lugar, os sistemas funcionam, a manutenção acontece.\n\nMas um lar vai além. Um lar tem uma presença. Uma atmosfera. Uma sensação que você reconhece antes mesmo de nomear. É o tipo de lugar que, quando você entra, algo no seu corpo relaxa — não porque está arrumado, mas porque está vivo de uma forma específica que é sua.\n\nEssa diferença não é sobre dinheiro. Não é sobre tamanho. Não é sobre estilo de decoração. É sobre intenção habitada.\n\n— O QUE CRIA A ATMOSFERA DE UM LAR —\n\nCHEIRO\nO olfato é o sentido mais diretamente ligado à memória e à emoção. Quando você associa um cheiro específico ao bem-estar — uma vela, ervas frescas, o café pela manhã, lavanda no quarto — esse cheiro passa a sinalizar ao seu sistema nervoso: aqui é um lugar seguro. Aqui você pode relaxar.\n\nLUZ\nLuz natural é insubstituível. Ela regula o ritmo circadiano, melhora o humor e reduz sintomas de ansiedade. À noite, luz quente e indireta cria acolhimento. Abajures, luminárias de chão, velas, fitas de LED quente — cada um adiciona uma camada de warmth que transforma a experiência noturna do espaço.\n\nTEXTURA\nCobertores macios, almofadas com textura, tapetes que convidam os pés descalços, madeira natural. A textura cria conforto físico — e conforto físico cria segurança emocional. Materiais macios ativam o sistema nervoso parassimpático — o modo de descanso que é o oposto do estado de alerta.\n\nMEMÓRIA AFETIVA\nFotos de pessoas amadas. Objetos trazidos de viagens que importaram. Heranças familiares que carregam história. Não em excesso — mas com presença intencional. Esses elementos criam densidade afetiva — a qualidade de um espaço que está vivo de significado pessoal.\n\nSILÊNCIO INTENCIONAL\nUm lar tem momentos de silêncio que não precisam ser preenchidos. Na cultura contemporânea, preenchemos cada momento com conteúdo. Mas o silêncio permite que o ambiente respire, que os pensamentos se organizem, que o descanso seja real.\n\n— A PRESENÇA COMO INGREDIENTE PRINCIPAL —\n\nUm lar não é um cenário. É um espaço vivo porque pessoas vivas o habitam com atenção.\n\nREFEIÇÕES À MESA, COM ATENÇÃO — não perfeitas, não elaboradas. Mas com presença. Sem tela, com as pessoas que você ama ou com você mesma, conscientemente.\n\nRITUAIS PEQUENOS E CONSISTENTES — o café da manhã preparado com cuidado. A vela acesa no jantar de sábado. O chá antes de dormir. Não por obrigação, mas porque marcam o tempo de uma forma que o torna mais real, mais habitado.\n\nMOMENTOS DE PARADA — sentar no sofá sem fazer nada. Olhar pela janela. Ficar parada na cozinha depois de terminar o café, apenas sentindo o espaço ao redor. Esses são os momentos em que você realmente habita o espaço, em vez de apenas transitar por ele.\n\nCUIDADO COM O ESPAÇO COMO CUIDADO CONSIGO MESMA — quando você coloca flores num vaso porque te alegra vê-las, quando você acende a vela não porque tem visita mas porque você merece — você está habitando o espaço com presença e com amor próprio.\n\n— UM EXEMPLO REAL —\n\nTeresa, 52 anos, tinha uma casa linda — bem decorada, bem organizada. Mas quando perguntei como ela se sentia em casa, ela ficou em silêncio antes de responder: "Honestamente? Como se estivesse de visita."\n\nA casa era funcional e bonita, mas não era dela. Era a casa que ela havia montado para impressionar — não a casa onde ela se sentia livre para ser quem era.\n\nO processo de transformar aquela casa em lar não envolveu reorganizar nada. Envolveu adicionar: a poltrona de leitura que ela sempre quis mas achava "desnecessária". As plantas que o marido anterior não gostava. O ritual do chá de ervas todas as noites, com a televisão desligada.\n\n"Demorei 52 anos para entender o que significa uma casa ser minha. Não é sobre decoração. É sobre permissão. Me dar permissão para habitar o espaço do jeito que me nutre — não do jeito que impressiona."\n\n— EXERCÍCIO DESTA AULA —\n\nPARTE 1 — O INVENTÁRIO SENSORIAL (15 minutos)\nPercorra sua casa com atenção aos cinco sentidos. Para cada cômodo, anote:\n• Cheiro: há algum cheiro intencional?\n• Luz: a iluminação convida ao descanso — ou é apenas funcional?\n• Textura: há elementos que convidam ao toque e ao conforto físico?\n• Memória afetiva: há objetos com presença afetiva real?\n• Som: há momentos de silêncio intencional?\n\nPARTE 2 — UM ELEMENTO DE LAR (esta semana)\nEscolha um único elemento sensorial para adicionar ou cultivar esta semana. Uma vela. Uma planta. Uma foto emoldurada. Um ritual de silêncio de 10 minutos antes de dormir.\n\nPequeno. Intencional. Seu.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Quando você entra em casa hoje, qual é a sensação predominante? Alívio, peso, neutralidade, acolhimento?\n2. Existe algum elemento sensorial que faz diferença no seu bem-estar e que você ainda não cultivou intencionalmente?\n3. O que significa, para você, "estar em casa"? Não o lugar — a sensação. Quando foi a última vez que sentiu isso?\n\n— PRÓXIMA AULA —\n\nAgora que você começou a entender o que transforma uma casa em lar, a próxima aula vai para uma prática concreta que sustenta essa transformação no cotidiano: os rituais de bem-estar. Você vai aprender a diferença entre rotina e ritual — e como criar momentos intencionais que transformam o ordinário em algo significativo, sem precisar de tempo extra ou recursos que você não tem.' },

{ title: 'Criando rituais de bem-estar em casa', type: 'checklist', content: 'Rituais não exigem mais tempo. Exigem mais atenção. E atenção é algo que você pode escolher dar — mesmo numa vida ocupada, mesmo numa semana difícil, mesmo num dia que não está indo bem.\n\n— A DIFERENÇA ENTRE ROTINA E RITUAL —\n\nUma ROTINA é uma sequência de ações executadas com regularidade, muitas vezes no piloto automático.\n\nUm RITUAL é a mesma sequência de ações — mas carregada de intenção e presença.\n\nO café da manhã pode ser uma rotina: rápido, em pé, verificando o celular. Ou pode ser um ritual: preparado com cuidado, saboreado devagar, vivido como os primeiros minutos do dia antes que qualquer demanda chegue.\n\nO tempo gasto é o mesmo. A experiência é completamente diferente.\n\n— POR QUE RITUAIS IMPORTAM —\n\nUma pesquisa da Universidade de Harvard mostrou que pessoas que praticam rituais antes de tarefas desafiadoras apresentam menos ansiedade e melhor desempenho. O poder não está no conteúdo do ritual, mas no ato de criar intenção consciente.\n\nNo contexto doméstico, rituais marcam o tempo. Numa vida onde os dias às vezes se confundem, rituais criam pontos de ancoragem — momentos que você reconhece como seus, que dizem ao seu cérebro: agora é este momento. Esteja aqui.\n\n— OS QUATRO TIPOS DE RITUAIS DE BEM-ESTAR —\n\nRITUAIS DE TRANSIÇÃO\nMarcam a passagem de um estado para outro — do trabalho para o descanso, da semana para o fim de semana.\n\nSem rituais de transição, os estados se misturam. Você está fisicamente em casa mas mentalmente ainda no trabalho.\n\nExemplos:\n• Trocar de roupa ao chegar em casa — sinal físico de que um modo terminou\n• Um copo d\'água ou chá ao chegar — sentar por 5 minutos antes de entrar nas demandas\n• Um banho de desaceleração no fim do dia — não funcional, mas intencional\n\nRITUAIS DE CONEXÃO\nCriam momentos de presença com as pessoas que você ama — ou com você mesma.\n\nExemplos:\n• Jantar à mesa, sem telas, algumas vezes por semana\n• Uma conversa de 10 minutos com os filhos antes de dormir\n• Um café da manhã consigo mesma no fim de semana — sem pressa, sem tela\n\nRITUAIS DE RESTAURO\nExistem exclusivamente para você — para recarregar, para desacelerar.\n\nExemplos:\n• Um banho longo e quente como ritual — não uma limpeza funcional, mas um momento de cuidado\n• 20 minutos de leitura antes de dormir — para prazer puro\n• Um momento de cuidado com o corpo — como ato de atenção consigo mesma\n\nRITUAIS DE GRATIDÃO E PRESENÇA\nCriam o hábito de notar o que está bem — contrariando o viés de negatividade natural do cérebro.\n\nExemplos:\n• Três coisas pelas quais você é grata hoje — escritas, não apenas pensadas — antes de dormir\n• Um momento de contemplação depois do reset semanal — perceber o que está bem\n• Um minuto de presença intencional num espaço da casa que você ama\n\n— CHECKLIST PARA CRIAR SEUS RITUAIS —\n\n✅ ESCOLHA UM PONTO DE ANCORAGEM\nTodo ritual precisa de um gatilho claro. "Quando chego em casa, troco de roupa antes de qualquer outra coisa." O gatilho torna o ritual automático com o tempo.\n\n✅ COMECE RIDICULAMENTE PEQUENO\nUm ritual de 2 minutos tem muito mais chance de acontecer do que um de 30. Comece menor do que parece necessário. A consistência supera a perfeição.\n\n✅ REMOVA A FRICÇÃO\nO que você precisa para o ritual deve estar acessível e visível. A vela no lugar onde vai acendê-la. O livro no criado-mudo. Quanto mais fácil é iniciar, mais o ritual acontece.\n\n✅ PROTEJA O TEMPO\nRituais precisam de proteção ativa. Comunique às pessoas que vivem com você. Coloque na agenda. Trate como compromisso.\n\n✅ NÃO QUEBRE A CORRENTE\nUm calendário simples onde você marca os dias que o ritual aconteceu é surpreendentemente eficaz para criar momentum.\n\n✅ ADAPTE, NÃO ABANDONE\nNas semanas difíceis, reduza o ritual à sua versão mínima — mas não o abandone. A versão mínima mantém o hábito vivo até as condições melhorarem.\n\n— SUGESTÕES POR MOMENTO DO DIA —\n\nMANHÃ\n• Abrir as janelas e ficar em silêncio por 2 minutos antes de qualquer tela\n• Preparar o café ou chá com atenção — sentir o calor, o cheiro, o momento\n• Fazer a cama com cuidado — como presente para a versão de você que vai se deitar à noite\n• Escrever uma intenção para o dia — uma palavra, uma frase\n\nTARDE / TRANSIÇÃO\n• O ritual de troca de roupa ao chegar em casa\n• 5 minutos de silêncio antes de entrar nas demandas da tarde\n• Uma xícara de chá como fronteira entre trabalho e casa\n\nNOITE\n• Acender uma vela no jantar — mesmo que seja só você\n• O reset noturno da cozinha como ritual de fechamento do dia\n• 20 minutos de leitura antes de dormir\n• Três gratidões escritas antes de apagar a luz\n• Preparar o dia seguinte como gesto de cuidado com a versão de você de amanhã\n\nFIM DE SEMANA\n• Um café da manhã longo e sem pressa — o ritual que marca que é fim de semana\n• O reset semanal como ritual de renovação, não de obrigação\n• Um momento intencional de não fazer nada — sentar, olhar, respirar\n\n— UM EXEMPLO REAL —\n\nIsadora, 34 anos, dizia que nunca tinha tempo para si mesma. Cada minuto do dia era dedicado a alguém ou a alguma tarefa. Ela havia se tornado invisível na própria vida.\n\nA mudança foi simples: depois que os filhos dormiam, acender uma vela, fazer um chá de camomila, e passar 20 minutos lendo um livro escolhido por prazer.\n\n"Parece ridiculamente pequeno. Mas esses 20 minutos mudaram algo em mim. É como se eu existisse de novo. Como se tivesse um pedaço do dia que é meu — não de ninguém mais."\n\nQuatro meses depois: "Eu não me tornei uma pessoa diferente. Mas aprendi a me tratar como se eu importasse. E isso mudou tudo."\n\n— EXERCÍCIO DESTA AULA —\n\nPARTE 1 — MAPEIE OS VAZIOS (10 minutos)\nOlhe para a sua semana típica. Onde existem momentos que poderiam ser rituais — mas que atualmente são preenchidos com distração ou piloto automático?\n\nPARTE 2 — ESCOLHA UM RITUAL PARA COMEÇAR\nDos quatro tipos, qual ressoa mais com o que você precisa agora? Defina:\n• O momento exato em que vai acontecer\n• O gatilho que vai dispará-lo\n• A duração mínima (comece com 5 minutos ou menos)\n• O que você precisa preparar para remover a fricção\n\nPARTE 3 — PRATIQUE POR 21 DIAS\nNão 21 dias perfeitos — 21 dias onde você tenta. Marque cada dia que aconteceu. Observe o que muda.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Existe algum ritual que você já praticou em alguma fase da vida e que perdeu com o tempo? O que ele te dava que sente falta?\n2. Qual dos quatro tipos de ritual é o mais ausente na sua vida agora?\n3. Se você tivesse apenas 10 minutos por dia para um ritual só seu, o que escolheria fazer com eles?\n\n— PRÓXIMA AULA —\n\nCom os rituais como prática concreta de bem-estar, a próxima aula vai aprofundar a relação entre o ambiente físico e a saúde mental. Você vai entender como sua casa pode ser ativamente projetada para apoiar seu bem-estar psicológico — e quais mudanças simples têm o maior impacto nessa direção.' },

{ title: 'A casa como espaço de saúde mental', type: 'artigo', content: 'Passamos em média 90% do nosso tempo em ambientes fechados. Isso significa que a qualidade desses ambientes não é um detalhe periférico da nossa saúde — é um fator central.\n\nSua casa não é apenas o lugar onde você dorme e guarda seus objetos. É um agente ativo na sua saúde mental — para o bem ou para o mal, dependendo de como está configurada.\n\n— O QUE A CIÊNCIA DIZ SOBRE AMBIENTES E SAÚDE MENTAL —\n\nLUZ NATURAL E RITMO CIRCADIANO\nO ritmo circadiano é o relógio biológico interno que regula praticamente todas as funções do corpo — sono, humor, metabolismo, sistema imunológico. E ele é sincronizado, primariamente, pela luz.\n\nAbrir as cortinas logo ao acordar não é apenas um gesto estético. É um ato de saúde. Posicionar sua área de trabalho perto de uma janela não é um luxo. É ergonomia mental.\n\nPLANTAS E BEM-ESTAR\nEstudos mostram que a presença de plantas em ambientes fechados reduz os níveis de cortisol, melhora a concentração em até 15%, reduz a pressão arterial em situações de estresse e aumenta a sensação subjetiva de bem-estar.\n\nEssa teoria está ligada ao que o biólogo E.O. Wilson chamou de biofilia — a tendência inata dos seres humanos de buscar conexão com outras formas de vida. Nosso sistema nervoso ainda responde a essa sinalização. Uma única planta faz diferença mensurável.\n\nORDEM VISUAL E CARGA COGNITIVA\nPesquisadores da Universidade de Princeton mostraram que ambientes desordenados reduzem significativamente a capacidade de foco e aumentam os níveis de estresse — mesmo quando a pessoa não está conscientemente prestando atenção à desordem.\n\nAmbientes com superfícies limpas reduzem a carga cognitiva, promovem relaxamento e facilitam o estado de flow — o foco profundo que acontece quando a mente não é interrompida por estímulos desnecessários.\n\nESPAÇOS DE TRANSIÇÃO E REGULAÇÃO EMOCIONAL\nO sistema nervoso não faz transições abruptas bem. Passar diretamente do estresse do trânsito para as demandas da casa mantém o sistema nervoso em estado de alerta por muito mais tempo.\n\nCriar espaços de transição — mesmo simbólicos — tem impacto real na regulação emocional. Um banco na entrada onde você senta por 2 minutos ao chegar. Um canto sem celular. Um ritual de desaceleração.\n\nCONTROLE DE SOM E SISTEMA NERVOSO\nPesquisas da OMS mostram que exposição crônica a ruído está associada a aumento de cortisol, pressão arterial elevada, qualidade de sono reduzida e maior irritabilidade.\n\nO controle de som no ambiente doméstico é uma forma de higiene do sistema nervoso. Televisão desligada durante as refeições. Notificações silenciadas em horários definidos. Momentos de silêncio deliberado ao longo do dia.\n\n— PROJETANDO SUA CASA PARA A SAÚDE MENTAL —\n\nMAXIMIZE A LUZ NATURAL\n• Abra as cortinas logo ao acordar e mantenha-as abertas durante o dia\n• Posicione sua área de trabalho perto de uma janela\n• Mantenha janelas limpas — vidros sujos reduzem significativamente a entrada de luz\n• Se a luz natural é limitada, considere lâmpadas de espectro completo\n\nTRAGA O VERDE PARA DENTRO\n• Comece com uma planta resistente — pothos, zamioculca, cacto, suculenta\n• Posicione onde você passa mais tempo — área de trabalho, sala, quarto\n• Ervas na janela da cozinha combinam o benefício visual com o sensorial\n\nREDUZA O RUÍDO VISUAL\n• Superfícies limpas, objetos com endereço, curadoria intencional\n• Reduza o número de itens sobre superfícies horizontais\n• Crie zonas visuais de descanso — onde o olho pode pousar sem ser capturado por estimulação\n\nCRIE ESPAÇOS DE TRANSIÇÃO\n• Um lugar específico para sentar ao chegar em casa — mesmo que por 2 minutos\n• Uma área sem tecnologia — onde você vai para descansar de verdade\n• Um ritual físico de transição entre o modo trabalho e o modo casa\n\nGERENCIE O SOM INTENCIONALMENTE\n• Estabeleça pelo menos 30 minutos por dia sem nenhum som de fundo\n• Desligue a televisão durante as refeições\n• Crie playlists intencionais para diferentes momentos\n• Silencie notificações em horários definidos\n\nCUIDE DA TEMPERATURA E DO AR\n• Ventile os ambientes diariamente — abra janelas por pelo menos 10 minutos\n• Umidificadores em climas secos melhoram o bem-estar e a qualidade do sono\n\n— UM EXEMPLO REAL —\n\nBeatriz, 45 anos, havia sido diagnosticada com transtorno de ansiedade generalizada dois anos antes. Estava em terapia e tomava medicação — mas sentia que havia algo no seu dia a dia que continuava alimentando a ansiedade.\n\nQuando analisamos seu ambiente: ela trabalhava num quarto sem janela. Tinha cortinas blackout no quarto. A televisão ficava ligada como ruído de fundo por praticamente todo o dia. Não havia nenhuma planta na casa.\n\nAs mudanças foram graduais: transferiu sua área de trabalho para a sala, próxima à janela. Trocou as blackout por persianas reguláveis. Desligou a televisão durante o dia. Colocou três plantas na sala e uma no banheiro.\n\nTrês meses depois, sua psiquiatra comentou: "O ambiente é parte do tratamento. Você mudou o contexto em que seu sistema nervoso opera todo dia."\n\n— EXERCÍCIO DESTA AULA —\n\nPARTE 1 — O DIAGNÓSTICO AMBIENTAL DE SAÚDE MENTAL (15 minutos)\nPercorra sua casa e avalie cada fator:\n\n🌞 LUZ NATURAL: quanta luz entra nos espaços onde você passa mais tempo? O que está bloqueando?\n🌿 VERDE: há plantas nos seus espaços? Onde faria mais sentido adicionar?\n👁️ ORDEM VISUAL: qual espaço tem o maior ruído visual? O que poderia ser reduzido?\n🔇 SOM: qual é o nível de ruído de fundo típico? Há horários de silêncio intencional?\n🚪 TRANSIÇÃO: existe algum espaço ou ritual que cria transição entre estados diferentes?\n\nPARTE 2 — UMA MUDANÇA DE SAÚDE MENTAL ESTA SEMANA\nEscolha o fator com maior impacto potencial e faça uma mudança concreta e acessível. Não uma reforma — um gesto intencional.\n\nPARTE 3 — OBSERVE E REGISTRE\nDurante duas semanas, observe como você se sente nos espaços após a mudança. Anote qualquer diferença — no humor, na qualidade do sono, na ansiedade, na concentração.\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Qual dos cinco fatores — luz, verde, ordem visual, som, transição — tem mais impacto na sua qualidade de vida agora?\n2. Existe algo no seu ambiente atual que você sente que está alimentando sua ansiedade ou estresse — mesmo que não tenha nomeado isso antes?\n3. Se você projetasse sua casa conscientemente para apoiar sua saúde mental, qual seria a primeira mudança que faria?\n\n— PRÓXIMA AULA —\n\nChegamos à última aula de toda a travessia. E ela não vai te ensinar nada novo sobre organização ou sistemas. Vai te convidar a olhar para o caminho percorrido — e para quem você se tornou ao percorrê-lo. Porque a maior transformação desta travessia nunca foi sobre a casa. Foi sobre você.' },

{ title: 'Sua nova história começa aqui', type: 'artigo', content: 'Você chegou até aqui.\n\nPare por um momento e deixe isso pousar. Não passe para a próxima coisa ainda. Fique aqui, neste momento, e reconheça o que aconteceu.\n\nVocê começou esta travessia num ponto específico — com uma casa que te pesava de formas que talvez você nem conseguisse nomear completamente. E você percorreu um caminho inteiro. Não de forma linear, não sem tropeços, não sempre com energia e motivação. Mas você percorreu.\n\nIsso não é pequeno.\n\n— O QUE REALMENTE ACONTECEU NESTA TRAVESSIA —\n\nVOCÊ APRENDEU A SE VER NO SEU AMBIENTE\nAntes, a casa era um cenário onde a vida acontecia. Agora você sabe que existe uma conversa constante entre o espaço que você habita e quem você é. Você aprendeu a ler essa conversa — e a participar dela de forma intencional.\n\nVOCÊ TOMOU DECISÕES QUE A MAIORIA DAS PESSOAS ADIA INDEFINIDAMENTE\nOrganizar, simplificar, descartar, criar sistemas, cultivar rituais — cada uma dessas práticas exige algo escasso e valioso: atenção deliberada à própria vida. A maioria das pessoas passa anos sabendo que algo precisa mudar e não agindo. Você agiu.\n\nVOCÊ CONSTRUIU UMA RELAÇÃO DIFERENTE COM O SEU ESPAÇO\nNão de perfeição — de cuidado. Perfeição é uma meta impossível que gera apenas frustração. Cuidado é uma prática diária que gera crescimento real.\n\nVOCÊ SE COLOCOU NA EQUAÇÃO\nAo decidir que seu ambiente merece cuidado, você estava dizendo que você merece cuidado. Que sua vida cotidiana importa. Que o jeito que você se sente em casa, todos os dias, é algo que vale a pena investir.\n\nNuma cultura que frequentemente pede às mulheres que coloquem todos os outros primeiro, isso é um ato de coragem silenciosa.\n\n— OS DIAS DIFÍCEIS QUE AINDA VÃO VIR —\n\nHaverá semanas em que a casa vai entrar em colapso. Em que os sistemas vão falhar. Em que você vai olhar ao redor e sentir que voltou à estaca zero.\n\nVocê não terá voltado à estaca zero. Mas vai parecer assim.\n\nNesses momentos, o que faz a diferença não é a perfeição dos sistemas — é a consciência que você desenvolveu. A capacidade de nomear o que está acontecendo. De saber o caminho de volta. De começar pelo menor passo possível.\n\nEssa consciência não desaparece nas semanas difíceis. É o que você realmente construiu aqui — e ela é sua, permanentemente.\n\n— O QUE FLORESCIMENTO REALMENTE SIGNIFICA —\n\nFlorescimento não é um estado permanente de leveza e perfeição. Não é uma casa sempre em ordem, uma rotina sempre cumprida, uma mente sempre clara.\n\nFlorescimento é a capacidade de retornar. De cair e saber o caminho de volta. De ter uma semana de colapso e não interpretar isso como fracasso definitivo. De construir e reconstruir com menos drama, mais compaixão e mais habilidade a cada ciclo.\n\nFlorescimento é uma prática, não um destino. E você já está praticando.\n\n— O QUE CONTINUAR SIGNIFICA —\n\nA travessia não termina aqui. Ela evolui.\n\nAPROFUNDAR O QUE VOCÊ CRIOU — os sistemas existem, mas podem ser refinados. Os hábitos estão nascendo, mas podem se fortalecer. A próxima fase é de consolidação — não de grandes transformações, mas de pequenos refinamentos contínuos.\n\nEXPANDIR PARA NOVAS ÁREAS — talvez você tenha começado pela casa e percebido que os mesmos princípios se aplicam a outras áreas. A organização do tempo. A simplificação dos compromissos. O consumo consciente nas finanças. Os princípios são os mesmos — os contextos se multiplicam.\n\nCOMPARTILHAR A TRAVESSIA — existe algo poderoso que acontece quando você compartilha o que aprendeu. Não para impressionar — mas porque quando você articula sua transformação para outra pessoa, ela se aprofunda em você.\n\nCONTINUAR SE TORNANDO — no fundo, tudo que fizemos aqui foi criar condições para que você possa se tornar mais plenamente quem você é.\n\n— UMA ÚLTIMA REFLEXÃO SOBRE LEVEZA —\n\nA leveza que o Bridge propõe não é a leveza de não ter problemas. Não é uma casa sempre perfeita. Não é uma vida sem peso.\n\nÉ a leveza de saber o caminho de volta quando você se perde. De ter um ambiente que te restaura em vez de te drenar. De não carregar o peso invisível de decisões adiadas, espaços que te pesam, sistemas que falharam antes mesmo de começar.\n\nÉ a leveza de uma mulher que sabe que seu espaço, sua rotina e sua vida cotidiana merecem cuidado — e que age a partir dessa convicção, um dia de cada vez, imperfeita e consistentemente.\n\nEssa leveza você já tem. Pode não sentir o tempo todo. Mas está lá — construída aula por aula, escolha por escolha, ao longo de toda esta travessia.\n\n— O EXERCÍCIO FINAL —\n\nPARTE 1 — A CARTA PARA O FUTURO\nEscreva uma carta para a versão de você daqui a um ano. Descreva onde você está agora, o que mudou, o que ainda está em construção, e o que você deseja para ela — não em termos de casa perfeita, mas de vida vivida. Guarde a carta. Leia daqui a um ano.\n\nPARTE 2 — A CELEBRAÇÃO\nEscolha uma forma de celebrar a conclusão desta travessia:\n• Um jantar especial preparado com cuidado na sua casa transformada\n• Uma tarde dedicada a um ritual que você criou e ama\n• Um presente para si mesma — pequeno e intencional\n• Uma foto da sua casa agora, ao lado do antes, com uma frase que capture o que mudou\n\nCelebre. Você percorreu algo real.\n\nPARTE 3 — A INTENÇÃO QUE CONTINUA\nReleia a intenção de travessia que você escreveu na Trilha Diagnosticar. Depois escreva uma nova — não para substituir, mas para expandir. Quem você está se tornando agora? O que você quer para a próxima fase?\n\n— PERGUNTAS PARA REFLETIR —\n\n1. Olhando para o ponto de partida e para onde você está agora, qual é a mudança mais significativa que aconteceu — não na casa, mas em você?\n2. O que você aprendeu sobre si mesma ao longo desta travessia que não esperava aprender?\n3. Qual é a próxima intenção? Não a próxima tarefa — a próxima intenção. O que você quer construir a partir daqui?\n\n— PARA VOCÊ, QUE CHEGOU ATÉ AQUI —\n\nVocê percorreu esta travessia num momento da sua vida. Com tudo que estava acontecendo ao redor — as demandas, os imprevistos, os dias sem energia. E ainda assim, você continuou.\n\nIsso diz algo sobre quem você é.\n\nNão sobre perfeição. Sobre comprometimento com a própria vida. Sobre a convicção de que você merece um ambiente que te nutra, uma rotina que te apoie, uma vida com mais intenção e mais leveza.\n\nEssa convicção é o que chegou aqui com você. E é o que vai continuar — muito além desta última aula, muito além desta trilha, muito além desta travessia.\n\nContinue sua travessia. 🌿' },
  ],
};

// ═══════════════════════════════════════
// DADOS RICOS DE TODAS AS AULAS (accordion, flashcards, quiz, exercício)
// ═══════════════════════════════════════

const LESSON_DATA = {
  'O peso invisível da desordem': {
    trilha: 'O peso invisível da desordem',
    intro: 'Você já acordou cansada, antes mesmo de o dia começar? Olhou ao redor e sentiu uma pressão difícil de nomear — como se a casa em si estivesse te pesando? Esse fenômeno tem nome e tem explicação científica.',
    objectives: ['Compreender: o que acontece no seu cérebro.', 'Reconhecer: isso é mais comum do que parece.', 'Aplicar na prática: o caminho inverso também é real.'],
    accordion: [
      { title: 'O que acontece no seu cérebro', description: 'Existe um conceito chamado carga cognitiva — a quantidade de informação que seu cérebro precisa processar simultaneamente. Em um ambiente desorganizado, essa carga está sempre elevada.\n\nImagine tentar assistir a um filme com dez pessoas falando ao mesmo tempo ao seu redor. Você até consegue, mas sai exausta. É exatamente isso que acontece quando seu ambiente está sobrecarregado: seu cérebro tenta processar tudo ao mesmo tempo, o tempo todo, sem descanso.\n\nHá também o que os psicólogos chamam de efeito Zeigarnik — a tendência do cérebro de manter tarefas inacabadas ativas na memória. Cada gaveta bagunçada, cada canto acumulado, cada objeto sem lugar é uma tarefa inacabada que seu cérebro recusa-se a fechar. Elas ficam lá, em segundo plano, consumindo energia que você poderia usar para o que realmente importa.' },
      { title: 'Isso é mais comum do que parece', description: 'No Brasil, a cultura do "guardar por precaução" é profunda. Crescemos vendo nossas mães e avós guardarem caixas, tecidos, objetos "que podem ser úteis um dia". Isso não é defeito — é herança cultural, muitas vezes ligada a períodos de escassez real.\n\nMas o mundo mudou. E carregar esse peso hoje, num ritmo de vida já intenso, tem um custo alto. A mulher brasileira contemporânea geralmente acumula: a rotina da casa, o trabalho fora, os filhos, os pais, as demandas sociais. Adicione um ambiente que não restaura — e você tem a fórmula do esgotamento silencioso que tantas mulheres reconhecem mas raramente conseguem nomear.' },
      { title: 'O caminho inverso também é real', description: 'Ambientes organizados reduzem a carga cognitiva, facilitam o sono, diminuem a ansiedade e aumentam a sensação de controle sobre a própria vida. Estudos mostram que pessoas que passam apenas 20 minutos organizando um espaço relatam melhora imediata no humor e na sensação de competência.\n\nOrganizar a casa não é uma tarefa doméstica. É um ato profundo de autocuidado.' },
    ],
    example: null,
    flashcards: [
      { front: 'O que acontece no seu cérebro', back: 'Existe um conceito chamado carga cognitiva — a quantidade de informação que seu cérebro precisa processar simultaneamente. Em um ambiente desorganizado, essa carga está sempre elevada.', audioTranscript: null },
      { front: 'Isso é mais comum do que parece', back: 'No Brasil, a cultura do "guardar por precaução" é profunda. Crescemos vendo nossas mães e avós guardarem caixas, tecidos, objetos "que podem ser úteis um dia".', audioTranscript: null },
      { front: 'O caminho inverso também é real', back: 'Ambientes organizados reduzem a carga cognitiva, facilitam o sono, diminuem a ansiedade e aumentam a sensação de controle sobre a própria vida. Estudos mostram que pessoas que passam apenas 20 minutos organizando um...', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Por que ambientes desorganizados aumentam o cansaço mental?',
      answers: [
        { title: 'Porque aumentam a carga cognitiva e mantêm o cérebro em alerta', correct: true, feedback: 'Isso mesmo — o ambiente desorganizado eleva a quantidade de estímulos que o cérebro precisa processar, mantendo-o em estado de alerta constante.' },
        { title: 'Porque exigem mais decisões rápidas', correct: false, feedback: 'Decisões fazem parte do problema, mas a causa principal está na sobrecarga cognitiva contínua, não na velocidade das decisões.' },
        { title: 'Porque deixam a casa esteticamente feia', correct: false, feedback: 'A estética importa, mas o efeito no cansaço mental vem da carga cognitiva, não da aparência.' },
        { title: 'Porque ocupam mais espaço físico', correct: false, feedback: 'O espaço físico ocupado não é o fator central — o que pesa é a sobrecarga de estímulos e informações.' },
      ],
      },
      {
        question: 'O que é o efeito Zeigarnik, citado na aula?',
        answers: [
          { title: 'A tendência do cérebro de manter tarefas inacabadas ativas na memória', correct: true, feedback: 'Isso mesmo — cada tarefa inacabada, como uma gaveta bagunçada, fica \'aberta\' na mente e consome energia.' },
          { title: 'A tendência de esquecer tarefas concluídas', correct: false, feedback: 'É o oposto — o efeito Zeigarnik é sobre tarefas inacabadas, não concluídas.' },
          { title: 'A necessidade de comprar objetos novos', correct: false, feedback: 'Isso não tem relação com o efeito Zeigarnik, que é sobre memória e tarefas pendentes.' },
          { title: 'O medo de jogar objetos fora', correct: false, feedback: 'Esse é outro fenômeno (apego/escassez), não o efeito Zeigarnik.' },
        ],
      },
      {
        question: 'Segundo a aula, organizar a casa é, acima de tudo:',
        answers: [
          { title: 'Um ato profundo de autocuidado', correct: true, feedback: 'Exatamente — a aula reforça que organizar vai muito além da tarefa doméstica; é cuidado com a própria mente.' },
          { title: 'Uma obrigação social', correct: false, feedback: 'A aula não trata organização como obrigação social, mas como autocuidado.' },
          { title: 'Uma tarefa puramente estética', correct: false, feedback: 'O foco da aula é o efeito mental, não a estética.' },
          { title: 'Uma competição entre vizinhas', correct: false, feedback: 'Isso não é mencionado na aula — o foco é bem-estar pessoal.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Primeira impressão', description: 'Escolha um cômodo da sua casa e entre nele como se fosse a primeira vez. Qual é a primeira sensação que você sente?' },
        { title: 'Uma palavra só', description: 'Se esse ambiente fosse uma única palavra, qual seria? Não pense demais — anote a primeira que vier.' },
        { title: 'O que você já nem vê mais', description: 'Tem algo neste espaço que te incomoda há semanas, mas você já nem repara mais porque se acostumou? Nomeie.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Agora que você começou a nomear o que sente, a próxima aula vai te ajudar a mapear sua casa cômodo por cômodo — para enxergar com clareza onde estão seus pontos de tensão e seus pontos de força.',
  },
  'Mapeando sua realidade atual': {
    trilha: 'Mapeando sua realidade atual',
    intro: 'Na aula anterior, você começou a nomear o que sente em relação ao seu ambiente. Agora vamos um passo além: transformar essa percepção em um mapa concreto. Um mapa tem um poder que a sensação não tem — ele torna visível o que antes era difuso.',
    objectives: ['Compreender: como fazer o mapeamento.', 'Reconhecer: as cinco perguntas para cada cômodo.', 'Aplicar na prática: classificando cada cômodo.'],
    accordion: [
      { title: 'Como fazer o mapeamento', description: 'Reserve entre 20 e 30 minutos. Pegue um caderno ou o notes do celular. Percorra cada cômodo da sua casa com calma — não para arrumar, mas para observar. Para cada ambiente, responda as cinco perguntas abaixo.' },
      { title: 'As cinco perguntas para cada cômodo', description: '✅ Este espaço me causa paz ou ansiedade ao entrar?\nConfie na primeira sensação, antes de qualquer racionalização. Seu corpo sabe antes da sua mente.\n\n✅ Consigo encontrar o que preciso em menos de 2 minutos?\nEsse é um teste prático de funcionalidade. Se você precisa procurar, o sistema está falhando.\n\n✅ Me sinto bem recebendo visitas neste cômodo?\nNão porque a casa precisa ser perfeita para os outros — mas porque essa pergunta revela o quanto você mesma aceita o espaço como ele está.\n\n✅ Este ambiente reflete quem eu sou hoje?\nNão quem você era há cinco anos, não quem você quer ser. Quem você é agora, nesta fase da vida.\n\n✅ Quando estou neste espaço, consigo descansar de verdade?\nDescanso real — não apenas parar o corpo, mas soltar a mente.' },
      { title: 'Classificando cada cômodo', description: 'Ao terminar as cinco perguntas de cada ambiente, dê a ele uma classificação:\n\n🟢 VERDE — Este espaço me serve bem. Posso aprender com ele.\n🟡 AMARELO — Funciona parcialmente. Precisa de atenção em alguns pontos.\n🔴 VERMELHO — Este espaço me pesa. É uma prioridade de transformação.\n\nNão existe proporção certa entre as cores. Algumas casas têm tudo vermelho — e tudo bem. Esse é o ponto de partida, não o destino.' },
    ],
    example: 'Maria tem 38 anos, dois filhos e trabalha em home office. Quando fez esse exercício, descobriu que a cozinha estava vermelha — bancada sempre acumulada, gavetas que ela evitava abrir. O quarto estava vermelho — a cadeira virou um segundo guarda-roupa. Mas o banheiro estava verde — o único espaço onde ela tinha um sistema claro.\n\nO banheiro verde foi a revelação mais importante. Ali ela tinha, sem perceber, criado um sistema que funcionava. A travessia dela começou por entender o que ela já fazia certo — e replicar essa lógica nos outros espaços.',
    flashcards: [
      { front: 'Como fazer o mapeamento', back: 'Reserve entre 20 e 30 minutos. Pegue um caderno ou o notes do celular.', audioTranscript: null },
      { front: 'As cinco perguntas para cada cômodo', back: '✅ Este espaço me causa paz ou ansiedade ao entrar? Confie na primeira sensação, antes de qualquer racionalização.', audioTranscript: null },
      { front: 'Classificando cada cômodo', back: 'Ao terminar as cinco perguntas de cada ambiente, dê a ele uma classificação:\n\n🟢 VERDE — Este espaço me serve bem. Posso aprender com ele.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual o objetivo principal do mapeamento da casa nesta aula?',
      answers: [
        { title: 'Tornar visível no papel o que antes só existia na cabeça', correct: true, feedback: 'Exato — colocar a casa no papel transforma a sensação difusa em algo concreto que pode ser trabalhado.' },
        { title: 'Decidir quais cômodos reformar primeiro', correct: false, feedback: 'O mapeamento é sobre observação e clareza, não sobre planejar reformas.' },
        { title: 'Comparar sua casa com a de outras pessoas', correct: false, feedback: 'O exercício é um olhar honesto sobre o próprio ponto de partida, sem comparação.' },
        { title: 'Definir uma casa \'modelo\' a ser copiada', correct: false, feedback: 'Não existe casa ideal a copiar — o exercício valoriza o ponto de partida real de cada pessoa.' },
      ],
      },
      {
        question: 'Quantas perguntas compõem o mapeamento de cada cômodo?',
        answers: [
          { title: 'Cinco', correct: true, feedback: 'Isso mesmo — são cinco perguntas aplicadas a cada ambiente da casa.' },
          { title: 'Três', correct: false, feedback: 'O mapeamento usa cinco perguntas, não três.' },
          { title: 'Dez', correct: false, feedback: 'São cinco perguntas, não dez.' },
          { title: 'Apenas uma pergunta geral', correct: false, feedback: 'O método usa cinco perguntas específicas, não uma única pergunta geral.' },
        ],
      },
      {
        question: 'O que significa a classificação amarela para um cômodo?',
        answers: [
          { title: 'Funciona parcialmente e precisa de atenção em alguns pontos', correct: true, feedback: 'Correto — amarelo indica um espaço que funciona, mas ainda tem pontos a melhorar.' },
          { title: 'O espaço está perfeito e não precisa de mudanças', correct: false, feedback: 'Essa descrição corresponde ao verde, não ao amarelo.' },
          { title: 'O espaço é uma prioridade máxima de transformação', correct: false, feedback: 'Essa é a classificação vermelha, não amarela.' },
          { title: 'O cômodo ainda não foi avaliado', correct: false, feedback: 'Amarelo é uma classificação já dada ao espaço, não ausência de avaliação.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Percorra a casa', description: 'Reserve 20 a 30 minutos e percorra cada cômodo com calma, respondendo as cinco perguntas da aula para cada um.' },
        { title: 'Classifique cada cômodo', description: 'Dê a cada ambiente uma cor — verde, amarelo ou vermelho — conforme o que você sentiu ao responder as perguntas.' },
        { title: 'Reconheça um espaço verde', description: 'Escolha pelo menos um cômodo verde para celebrar — e observe o que você já faz certo ali, que pode replicar nos outros.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Agora que você tem o mapa, a próxima aula vai identificar seus pontos críticos de sobrecarga — os momentos específicos do dia em que a desorganização cobra o maior preço. Porque nem toda tensão tem a ver com o espaço físico. Algumas das sobrecargas mais pesadas são invisíveis.',
  },
  'Identificando seus pontos de sobrecarga': {
    trilha: 'Identificando seus pontos de sobrecarga',
    intro: 'Você já tem o mapa da sua casa. Já sabe quais espaços te servem e quais te pesam. Agora vamos aprofundar esse olhar para identificar algo mais específico — e mais revelador: os pontos críticos de sobrecarga.',
    objectives: ['Compreender: o que é um ponto crítico.', 'Reconhecer: os pontos críticos mais comuns.', 'Aplicar na prática: por que os pontos críticos se repetem.'],
    accordion: [
      { title: 'O que é um ponto crítico', description: 'Um ponto crítico tem três elementos simultâneos:\n\nUM ESPAÇO — um cômodo, uma superfície, um canto específico da casa.\nUM HORÁRIO — um momento do dia em que aquele espaço concentra pressão.\nUMA EMOÇÃO — frustração, culpa, pressa, vergonha, impotência.\n\nQuando os três se encontram com frequência, você tem um ponto crítico. E ele está consumindo energia sua todos os dias — mesmo nos dias em que você não percebe conscientemente.' },
      { title: 'Os pontos críticos mais comuns', description: '🍳 A bancada da cozinha entre 17h e 19h\nO jantar precisa ser feito, as crianças chegam da escola, o trabalho ainda não terminou. E a bancada está coberta de coisas acumuladas desde a manhã. O que deveria ser um momento de cuidado vira um campo de batalha logístico.\n\n👗 O closet entre 6h30 e 7h30\nA roupa certa não aparece. Você experimenta três combinações, descarta tudo, sai de casa com a sensação de derrota — e o dia ainda mal começou. Cada manhã assim é uma pequena sangria de autoconfiança.\n\n📚 A mesa de trabalho a qualquer hora\nDocumentos, carregadores, correspondências, objetos sem sentido. Um espaço que deveria promover foco se torna um espelho da desorganização — e dificulta qualquer tentativa de concentração profunda.\n\n🚪 A entrada da casa ao final do dia\nA bolsa fica no chão, os sapatos espalhados, as chaves em lugar nenhum. A entrada que deveria sinalizar "você chegou, pode descansar" sinaliza o oposto.\n\n📋 A agenda mental da semana\nEsse ponto crítico não tem localização física — ele existe na sua cabeça. São os compromissos que você teme esquecer, as tarefas que ficam na memória porque não estão escritas em lugar nenhum.' },
      { title: 'Por que os pontos críticos se repetem', description: 'FLUXO SEM DESTINO — objetos que chegam a um espaço mas não têm para onde ir. A bancada acumula porque não existe um sistema claro de para onde cada coisa vai.\n\nTRANSIÇÃO DE ESTADO — momentos em que você muda de modo (trabalho para casa, manhã para tarde) são naturalmente vulneráveis à desorganização. A mente está fazendo uma troca de contexto e o ambiente sofre as consequências.\n\nDECISÃO ADIADA — muitos pontos críticos são cemitérios de decisões postergadas. A pilha de roupas na cadeira são decisões de "onde isso fica?" que você não tomou ainda.\n\nEntender o mecanismo por trás do seu ponto crítico é mais poderoso do que simplesmente organizar o espaço — porque sem entender a causa, o espaço volta ao mesmo estado em semanas.' },
    ],
    example: 'Claudia, 41 anos, professora e mãe de dois filhos, identificou seu principal ponto crítico: a entrada da casa entre 18h e 19h. Todo dia, ao chegar do trabalho, ela deixava a bolsa no chão, os sapatos onde tirava, as compras na primeira superfície disponível.\n\nQuando analisou o padrão, percebeu que o problema não era falta de organização — era ausência de sistema. A solução foi simples: um gancho na parede, um tapete demarcando a zona de sapatos, uma cesta para itens temporários. Três objetos. Dez minutos de implementação. O ponto crítico desapareceu — e com ele, a sensação de derrota que ela carregava todo dia ao chegar em casa.',
    flashcards: [
      { front: 'O que é um ponto crítico', back: 'Um ponto crítico tem três elementos simultâneos:\n\nUM ESPAÇO — um cômodo, uma superfície, um canto específico da casa. UM HORÁRIO — um momento do dia em que aquele espaço concentra pressão.', audioTranscript: null },
      { front: 'Os pontos críticos mais comuns', back: '🍳 A bancada da cozinha entre 17h e 19h\nO jantar precisa ser feito, as crianças chegam da escola, o trabalho ainda não terminou. E a bancada está coberta de coisas acumuladas desde a manhã.', audioTranscript: null },
      { front: 'Por que os pontos críticos se repetem', back: 'FLUXO SEM DESTINO — objetos que chegam a um espaço mas não têm para onde ir. A bancada acumula porque não existe um sistema claro de para onde cada coisa vai.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'O que caracteriza um \'ponto crítico\' na casa, segundo a aula?',
      answers: [
        { title: 'Um espaço, um horário e um padrão de comportamento que se repetem juntos', correct: true, feedback: 'Correto — um ponto crítico combina espaço, horário e padrão recorrente, não apenas bagunça isolada.' },
        { title: 'Qualquer cômodo que esteja sujo', correct: false, feedback: 'Sujeira não é o critério — o que define o ponto crítico é a repetição de espaço, horário e padrão.' },
        { title: 'O cômodo mais caro da casa', correct: false, feedback: 'Valor financeiro não tem relação com a definição de ponto crítico.' },
        { title: 'O último cômodo a ser organizado', correct: false, feedback: 'A ordem de organização não define o que é um ponto crítico.' },
      ],
      },
      {
        question: 'Quais são os três elementos simultâneos de um ponto crítico?',
        answers: [
          { title: 'Um espaço, um horário e uma emoção', correct: true, feedback: 'Exato — os três elementos juntos, com frequência, definem um ponto crítico.' },
          { title: 'Um objeto, um preço e uma marca', correct: false, feedback: 'Esses elementos não fazem parte da definição de ponto crítico.' },
          { title: 'Uma cor, um cheiro e um som', correct: false, feedback: 'A definição não envolve esses elementos sensoriais.' },
          { title: 'Um dia da semana, um clima e uma estação do ano', correct: false, feedback: 'A aula não define ponto crítico dessa forma.' },
        ],
      },
      {
        question: 'O que é decisão adiada, uma das causas dos pontos críticos se repetirem?',
        answers: [
          { title: 'Objetos parados porque a decisão de onde algo fica nunca foi tomada', correct: true, feedback: 'Isso mesmo — pilhas e acúmulos são frequentemente decisões que ainda não foram tomadas.' },
          { title: 'A escolha de contratar um profissional', correct: false, feedback: 'Não é isso — decisão adiada é sobre não decidir o destino de um objeto.' },
          { title: 'Um horário fixo para organizar a casa', correct: false, feedback: 'Isso seria um sistema, não uma decisão adiada.' },
          { title: 'A preferência por guardar tudo em caixas', correct: false, feedback: 'Isso não define decisão adiada segundo a aula.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'O espaço', description: 'Pense num momento recente de sobrecarga em casa. Em qual cômodo ou superfície específica ele aconteceu?' },
        { title: 'O horário', description: 'Que horas eram? Preste atenção: o horário costuma revelar padrões que se repetem.' },
        { title: 'A emoção', description: 'O que você sentiu naquele momento — frustração, culpa, pressa, vergonha? Nomeie a emoção exata, sem julgamento.' },
        { title: 'A ação frustrada', description: 'O que você estava tentando fazer quando a sobrecarga aconteceu? Essa é a ação que o ponto crítico está sabotando.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Agora você sabe onde estão seus pontos de sobrecarga. Mas antes de começar a agir, existe uma etapa fundamental que a maioria das pessoas pula — e que explica por que tantas reorganizações não duram. Na próxima aula você vai criar sua intenção de travessia: o porquê profundo que vai te sustentar nos dias difíceis e dar direção a cada escolha daqui para frente.',
  },
  'Criando sua intenção de travessia': {
    trilha: 'Criando sua intenção de travessia',
    intro: 'Você chegou à última aula da Trilha Diagnosticar. Até aqui, você nomeou o que sente, mapeou sua casa, identificou seus pontos críticos. Você tem clareza sobre o ponto de partida.',
    objectives: ['Compreender: a diferença entre meta e intenção.', 'Reconhecer: por que a intenção sustenta quando a motivação some.', 'Aplicar na prática: o que uma intenção de travessia não é.'],
    accordion: [
      { title: 'A diferença entre meta e intenção', description: 'Uma META é externa e mensurável. "Organizar o closet até sexta." Metas têm valor — mas elas não te sustentam nos dias difíceis. Quando a semana desanda, a meta vira culpa.\n\nUma INTENÇÃO é interna e afetiva. Ela não descreve o que você vai fazer — descreve como você quer se sentir. E sentimentos têm uma força motivacional muito mais profunda e duradoura do que tarefas.\n\nA intenção de travessia é pessoal, específica e visceral. Não é "ter uma casa organizada". É:\n\n"Quero ter energia para brincar com minha filha depois do jantar — sem sentir que a casa está me cobrando algo."\n\n"Quero me sentir bem recebendo uma amiga sem precisar pedir desculpas pelo ambiente antes de ela entrar."\n\n"Quero acordar na segunda-feira sem aquela sensação de peso antes mesmo de o dia começar."\n\nEssas intenções têm um rosto, um horário, uma emoção específica. Elas são reais porque descrevem momentos reais da sua vida.' },
      { title: 'Por que a intenção sustenta quando a motivação some', description: 'A motivação é um estado emocional — ela vem e vai. Você pode estar muito motivada hoje e completamente sem energia na quinta-feira depois de um dia longo. Isso é humano e previsível.\n\nA intenção funciona diferente. Ela não depende de como você está se sentindo agora. É uma âncora que você criou num momento de clareza para usar nos momentos de névoa.\n\nPesquisas em psicologia da motivação mostram que pessoas que conectam seus objetivos a valores e emoções pessoais têm duas vezes mais chance de manter comportamentos novos ao longo do tempo, comparado a pessoas que trabalham apenas com metas funcionais.' },
      { title: 'O que uma intenção de travessia não é', description: 'Não é uma promessa de perfeição. "Quero ter uma casa sempre organizada" é uma armadilha. Sempre é impossível — e impossível vira desistência.\n\nNão é para os outros. "Quero que meu marido pare de reclamar" coloca sua transformação nas mãos de outra pessoa.\n\nNão é uma punição disfarçada. "Preciso me organizar porque sou uma bagunça" parte de autocrítica — e autocrítica raramente sustenta transformação real.\n\nNão precisa ser grandiosa. "Quero conseguir tomar café da manhã sentada, com calma, sem olhar para a pia cheia" é uma intenção completamente válida — e profundamente humana.' },
      { title: 'Trilha 1 concluída', description: 'Você não apenas leu sobre organização — você começou a se conhecer como alguém que vive num espaço físico e é afetada por ele. Agora você tem um mapa real da sua casa, clareza sobre seus pontos críticos e uma intenção que vai além da superfície.\n\nA Trilha Organizar começa exatamente onde você está agora. A primeira aula vai te mostrar como transformar esse diagnóstico em ação concreta — sem a paralisia do "por onde começo?". Sua travessia está só começando. 🌿' },
    ],
    example: 'Renata, 35 anos, trabalha em home office e tem um filho de 4 anos. Sua primeira intenção foi: "Quero ter uma casa organizada e limpa." Genérica demais.\n\nTrabalhando mais fundo, ela chegou a: "Quero que meu filho veja a mãe relaxada em casa — não sempre correndo, sempre estressada com a bagunça. Quero que ele lembre da nossa casa como um lugar gostoso."\n\nNos dias sem energia, ela relia essa intenção. Não porque a obrigava a fazer alguma coisa — mas porque a reconectava ao que importava. E às vezes isso era suficiente para dar um pequeno passo.',
    flashcards: [
      { front: 'A diferença entre meta e intenção', back: 'Uma META é externa e mensurável. "Organizar o closet até sexta." Metas têm valor — mas elas não te sustentam nos dias difíceis.', audioTranscript: null },
      { front: 'Por que a intenção sustenta quando a motivação some', back: 'A motivação é um estado emocional — ela vem e vai. Você pode estar muito motivada hoje e completamente sem energia na quinta-feira depois de um dia longo.', audioTranscript: null },
      { front: 'O que uma intenção de travessia não é', back: 'Não é uma promessa de perfeição. "Quero ter uma casa sempre organizada" é uma armadilha.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual a principal diferença entre uma meta e uma intenção, segundo a aula?',
      answers: [
        { title: 'A intenção sustenta mesmo quando a motivação desaparece; a meta depende de cumprimento externo', correct: true, feedback: 'Isso mesmo — a intenção é um compromisso interno que resiste aos dias difíceis, diferente da meta, que vira culpa quando não cumprida.' },
        { title: 'Meta e intenção são a mesma coisa com nomes diferentes', correct: false, feedback: 'Não são a mesma coisa — a aula distingue claramente as duas, com efeitos bem diferentes na motivação.' },
        { title: 'A intenção é sempre mais fácil de medir que a meta', correct: false, feedback: 'Na verdade é o contrário: metas são mensuráveis; intenções são mais sobre direção e sustentação interna.' },
        { title: 'A meta é para o longo prazo, a intenção para o curto prazo', correct: false, feedback: 'O prazo não é o que diferencia as duas — o que muda é se o compromisso é externo/mensurável ou interno/sustentador.' },
      ],
      },
      {
        question: 'Qual das opções abaixo é um exemplo de intenção, segundo a aula?',
        answers: [
          { title: 'Quero acordar na segunda sem aquela sensação de peso antes mesmo do dia começar', correct: true, feedback: 'Isso mesmo — é uma intenção pessoal, afetiva e específica, como a aula recomenda.' },
          { title: 'Organizar o closet até sexta-feira', correct: false, feedback: 'Essa frase é um exemplo de meta, não de intenção.' },
          { title: 'Comprar um organizador novo', correct: false, feedback: 'Isso é uma ação pontual, não uma intenção emocional.' },
          { title: 'Fazer faxina geral no fim de semana', correct: false, feedback: 'Essa é uma tarefa concreta, não uma intenção afetiva.' },
        ],
      },
      {
        question: 'Segundo a aula, o que uma intenção de travessia não deve ser?',
        answers: [
          { title: 'Uma promessa de perfeição ou uma punição disfarçada', correct: true, feedback: 'Correto — a aula alerta que intenções baseadas em perfeição ou autocrítica raramente sustentam a mudança.' },
          { title: 'Algo pessoal e visceral', correct: false, feedback: 'Isso é justamente o que uma boa intenção deve ser, segundo a aula.' },
          { title: 'Conectada a uma emoção específica', correct: false, feedback: 'Esse é um traço desejável de uma boa intenção, não algo a evitar.' },
          { title: 'Simples e cotidiana', correct: false, feedback: 'A aula valoriza intenções simples — isso não é um problema.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Como você quer se sentir', description: 'Reserve 10 a 15 minutos de silêncio. Responda por escrito: como eu quero me sentir ao chegar em casa depois de um dia longo?' },
        { title: 'O momento a transformar', description: 'Que momento do dia eu mais quero transformar? Descreva com detalhes o que acontece nele hoje.' },
        { title: 'Daqui a três meses', description: 'Se essa travessia der certo, o que terá mudado de concreto na minha vida daqui a 3 meses? Quem se beneficia, além de mim?' },
        { title: 'Escreva sua intenção', description: 'Reúna suas respostas numa frase curta e pessoal — essa é a sua intenção de travessia. Guarde-a em um lugar visível.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Reflita sobre o que essa aula revelou para você. Anote suas percepções e continue na sua travessia.',
  },
  'Por onde começar (sem se sentir perdida)': {
    trilha: 'Por onde começar (sem se sentir perdida)',
    intro: 'Você concluiu a Trilha Diagnosticar com algo que a maioria das pessoas não tem quando tenta se organizar: um mapa real da sua casa, clareza sobre seus pontos críticos e uma intenção que vai além da superfície. Agora começa a ação. E é exatamente aqui que a maioria das pessoas tropeça — não por falta de vontade, mas por falta de método.',
    objectives: ['Compreender: o método das ondas.', 'Reconhecer: como aplicar o método das ondas.', 'Aplicar na prática: a ordem recomendada.'],
    accordion: [
      { title: 'O método das ondas', description: 'A ideia é simples: em vez de tentar organizar a casa inteira, você escolhe um único ponto de impacto — o espaço que mais afeta sua rotina diária. Você age ali com foco e profundidade. Quando esse espaço está funcionando bem, a energia gerada por essa vitória te impulsiona para o próximo.\n\nO Método das Ondas funciona por três razões:\n\nVITÓRIAS CONCRETAS GERAM DOPAMINA — Quando você completa algo, seu cérebro libera dopamina, o neurotransmissor da recompensa. Isso cria motivação real para continuar.\n\nFOCO PROFUNDO SUPERA ESFORÇO DISPERSO — Uma hora de atenção total num único espaço transforma mais do que três horas pulando de cômodo em cômodo sem terminar nada.\n\nO MOMENTUM É REAL — Organização gera organização. Quando um espaço está funcionando bem, você começa a enxergar os outros com mais clareza — e com mais energia para agir.' },
      { title: 'Como aplicar o método das ondas', description: 'PASSO 1 — Escolha seu ponto de impacto\nVolte ao mapa que você criou na Trilha Diagnosticar. Olhe para os espaços vermelhos. Qual desses espaços, se organizado, mudaria mais sua rotina diária?\n\nPASSO 2 — Defina um bloco de tempo\nTrabalhe em blocos de 25 a 45 minutos, nunca mais que isso sem uma pausa. Nosso foco tem limite fisiológico — respeitar isso não é fraqueza, é inteligência.\n\nPASSO 3 — Regra da caixa de redistribuição\nColoque uma caixa vazia na entrada do cômodo. Tudo que não pertence àquele espaço vai para a caixa — mas você não sai para guardar agora. Você termina o cômodo primeiro, depois redistribui.\n\nPASSO 4 — Termine o que começou\nNão passe para o próximo espaço antes de concluir o atual. Uma gaveta completamente organizada vale mais do que cinco gavetas pela metade.\n\nPASSO 5 — Celebre e registre\nQuando terminar, tire uma foto do espaço. Sente-se ali por 5 minutos e sinta a diferença. Esse momento de reconhecimento consciente é parte do processo.' },
      { title: 'A ordem recomendada', description: '1º O quarto — é o espaço que você vê primeiro ao acordar e último ao dormir. Um quarto que restaura muda o tom emocional de todo o dia.\n2º A cozinha — coração operacional da casa. Quando a cozinha funciona, o dia flui com menos atrito.\n3º O closet — elimina a fadiga de decisão matinal e começa o dia com mais autoconfiança.\n4º As áreas comuns — sala, corredor, entrada — os espaços que todos usam e ninguém organiza.\n5º Documentos e papéis — a desordem invisível que gera ansiedade silenciosa.' },
    ],
    example: 'Fernanda, 43 anos, tinha a casa inteira para organizar e não sabia por onde começar. Toda vez que tentava, ficava sobrecarregada e desistia no meio.\n\nQuando aplicou o Método das Ondas, escolheu começar pela bancada da cozinha — seu ponto crítico mais doloroso. Dedicou 40 minutos numa tarde de sábado. Só a bancada. Nada mais.\n\nO resultado foi imediato. Preparar o jantar naquela noite foi diferente. Em três semanas, a cozinha estava completamente transformada — sem nenhuma tarde exaustiva de reorganização total. "Eu sempre achei que precisava de um fim de semana inteiro livre para organizar. Mas o que eu precisava era de método."',
    flashcards: [
      { front: 'O método das ondas', back: 'A ideia é simples: em vez de tentar organizar a casa inteira, você escolhe um único ponto de impacto — o espaço que mais afeta sua rotina diária. Você age ali com foco e profundidade.', audioTranscript: null },
      { front: 'Como aplicar o método das ondas', back: 'PASSO 1 — Escolha seu ponto de impacto\nVolte ao mapa que você criou na Trilha Diagnosticar. Olhe para os espaços vermelhos.', audioTranscript: null },
      { front: 'A ordem recomendada', back: '1º O quarto — é o espaço que você vê primeiro ao acordar e último ao dormir. Um quarto que restaura muda o tom emocional de todo o dia.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'No método das ondas, qual é a estratégia recomendada?',
      answers: [
        { title: 'Escolher um único ponto de impacto e agir ali com profundidade antes de seguir adiante', correct: true, feedback: 'Exatamente — focar em um espaço de cada vez evita a sobrecarga de tentar organizar tudo ao mesmo tempo.' },
        { title: 'Organizar todos os cômodos ao mesmo tempo, um pouco em cada um', correct: false, feedback: 'Esse é justamente o padrão que o método das ondas busca evitar, por gerar dispersão e cansaço.' },
        { title: 'Contratar alguém para organizar a casa inteira de uma vez', correct: false, feedback: 'O método é sobre ação própria, focada e progressiva — não sobre terceirizar tudo de uma vez.' },
        { title: 'Esperar motivação alta antes de começar qualquer coisa', correct: false, feedback: 'O método das ondas é justamente uma forma de agir mesmo sem motivação alta, com pequenos pontos de impacto.' },
      ],
      },
      {
        question: 'Qual é o primeiro passo do Método das Ondas?',
        answers: [
          { title: 'Escolher um único ponto de impacto a partir do mapa da Trilha Diagnosticar', correct: true, feedback: 'Isso mesmo — tudo começa escolhendo com foco um espaço prioritário.' },
          { title: 'Comprar organizadores para todos os cômodos', correct: false, feedback: 'O método não começa com compras, e sim com a escolha de um ponto de impacto.' },
          { title: 'Contratar uma equipe de limpeza', correct: false, feedback: 'O primeiro passo é pessoal e estratégico, não terceirizado.' },
          { title: 'Fazer uma lista de compras', correct: false, feedback: 'Esse não é o primeiro passo do método descrito na aula.' },
        ],
      },
      {
        question: 'Qual é a ordem recomendada para começar a organizar a casa?',
        answers: [
          { title: 'Quarto, cozinha, closet, áreas comuns, documentos', correct: true, feedback: 'Correto — essa é a sequência sugerida na aula, começando pelo espaço de maior impacto emocional.' },
          { title: 'Documentos, cozinha, quarto, closet, áreas comuns', correct: false, feedback: 'Essa não é a ordem recomendada pela aula.' },
          { title: 'Áreas comuns, closet, documentos, quarto, cozinha', correct: false, feedback: 'A ordem sugerida começa pelo quarto, não pelas áreas comuns.' },
          { title: 'A ordem não importa, qualquer sequência funciona igual', correct: false, feedback: 'A aula sugere uma ordem específica, com o quarto em primeiro lugar.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Escolha seu ponto de impacto', description: 'Volte ao mapa da Trilha Diagnosticar. Qual espaço vermelho, se organizado, mudaria mais a sua rotina diária?' },
        { title: 'Defina o bloco de tempo', description: 'Escolha um bloco de 25 a 45 minutos para trabalhar nesse espaço, sem interrupções.' },
        { title: 'Use a caixa de redistribuição', description: 'Coloque uma caixa vazia na entrada do cômodo. Tudo que não pertence ali vai para a caixa — mas só será guardado depois.' },
        { title: 'Termine antes de começar outro', description: 'Não passe para o próximo espaço antes de concluir o atual por completo. Uma gaveta pronta vale mais que cinco pela metade.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Você tem o método. Agora vamos para o primeiro espaço — e o mais poderoso para começar: o quarto. Na próxima aula você vai entender por que esse cômodo tem um impacto desproporcional na sua saúde mental e vai receber um checklist completo para transformá-lo passo a passo.',
  },
  'O quarto que restaura': {
    trilha: 'O quarto que restaura',
    intro: 'Seu quarto é o espaço mais íntimo da casa. É o primeiro ambiente que você vê ao acordar — antes de qualquer tela, qualquer demanda, qualquer notificação. E é o último que você vê antes de dormir.',
    objectives: ['Compreender: o que rouba a paz do quarto.', 'Reconhecer: checklist completo.', 'Aplicar na prática: o teste final.'],
    accordion: [
      { title: 'O que rouba a paz do quarto', description: 'A CADEIRA ACUMULADORA — em quase toda casa brasileira existe uma cadeira no quarto que virou um segundo guarda-roupa. Roupas que "foram usadas mas ainda podem ser usadas de novo", peças que não foram guardadas. Essa cadeira é o símbolo da decisão adiada.\n\nO CRIADO-MUDO SOBRECARREGADO — remédios, livros empilhados, carregadores, recibos, bijuterias, copos d\'água velhos. Uma superfície que deveria ser de descanso virou depósito de tudo que não tem lugar definido.\n\nO EMBAIXO DA CAMA — invisível mas presente na memória. Caixas sem identificação, objetos esquecidos. O que está fora de vista ainda ocupa espaço mental.\n\nAS TELAS NO QUARTO — celular na cabeceira, televisão ligada para dormir. As telas mantêm a mente em modo de processamento quando ela deveria estar desacelerando.' },
      { title: 'Checklist completo', description: 'SUPERFÍCIES\n✅ O criado-mudo tem no máximo: luminária, livro ou caderno em uso, e um item pessoal significativo\n✅ A penteadeira ou cômoda está livre de objetos que não pertencem ali\n✅ Não existe "a cadeira" acumulando roupas — cada peça tem um destino claro\n✅ O topo do guarda-roupa não está sendo usado como depósito\n\nROUPAS E GUARDA-ROUPA\n✅ Todas as roupas têm um lugar definido — não ficam "de passagem" em nenhuma superfície\n✅ As peças que você usa com mais frequência estão nas posições mais acessíveis\n✅ Não há roupas que você nunca usa ocupando espaço de roupas que você usa todo dia\n✅ Existe um sistema claro para roupas usadas mas não sujas (gancho, cesto dedicado)\n\nEMBAIXO DA CAMA\n✅ Está completamente vazio — permitindo circulação de ar e limpeza fácil\n✅ Ou está organizado em caixas identificadas com itens de uso sazonal\n\nAMBIENTE\n✅ O quarto tem ventilação adequada e entrada de luz natural\n✅ Há pelo menos um elemento que te traz prazer estético: planta, quadro, vela, objeto afetivo\n✅ As cortinas ou persianas permitem escurecer o ambiente para dormir\n✅ Não há equipamentos de trabalho visíveis no quarto\n\nTECNOLOGIA\n✅ O celular não carrega na cabeceira — existe um local fora do alcance imediato\n✅ Se há televisão, existe um horário definido para desligar\n✅ Há pelo menos 30 minutos de rotina noturna sem telas antes de dormir' },
      { title: 'O teste final', description: 'Depois de aplicar o checklist, deite na sua cama e olhe ao redor por 2 minutos sem fazer nada. O que você sente? O ambiente te convida ao descanso — ou ainda tem algo te puxando para a ação, para a culpa, para a lista mental de pendências?\n\nUm quarto que restaura é aquele onde você consegue deitar e soltar. Onde o ambiente diz ao seu sistema nervoso: aqui você pode descansar. Aqui está tudo bem.' },
    ],
    example: 'Tatiana, 37 anos, reclamava que nunca conseguia descansar de verdade — mesmo nos fins de semana. Acordava cansada, dormia com dificuldade, sentia que o quarto a sufocava.\n\nQuando fez o checklist, identificou três problemas: a cadeira acumuladora com três semanas de roupas empilhadas, o criado-mudo com onze itens sobre ele, e o celular sempre carregando a 30 centímetros do rosto.\n\nEla dedicou uma tarde para resolver os três. Na primeira semana, relatou dormir melhor do que em meses. "Parece bobo," ela disse, "mas é como se o quarto finalmente tivesse me dado permissão para descansar."',
    flashcards: [
      { front: 'O que rouba a paz do quarto', back: 'A CADEIRA ACUMULADORA — em quase toda casa brasileira existe uma cadeira no quarto que virou um segundo guarda-roupa. Roupas que "foram usadas mas ainda podem ser usadas de novo", peças que não foram guardadas.', audioTranscript: null },
      { front: 'Checklist completo', back: 'SUPERFÍCIES\n✅ O criado-mudo tem no máximo: luminária, livro ou caderno em uso, e um item pessoal significativo\n✅ A penteadeira ou cômoda está livre de objetos que não pertencem ali\n✅ Não existe "a cadeira" acumulando...', audioTranscript: null },
      { front: 'O teste final', back: 'Depois de aplicar o checklist, deite na sua cama e olhe ao redor por 2 minutos sem fazer nada. O que você sente?', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual é o teste final sugerido para avaliar se o quarto está restaurador?',
      answers: [
        { title: 'Deitar na cama e observar por 2 minutos o que se sente em relação ao ambiente', correct: true, feedback: 'Isso mesmo — o teste final é sensorial: perceber se o ambiente convida ao descanso ou ainda puxa a atenção para tarefas pendentes.' },
        { title: 'Contar quantos objetos existem no quarto', correct: false, feedback: 'A quantidade de objetos não é o teste — o que importa é a sensação ao estar no espaço.' },
        { title: 'Comparar o quarto com fotos de revistas de decoração', correct: false, feedback: 'O teste não é estético nem comparativo — é sobre a sensação pessoal de descanso.' },
        { title: 'Perguntar a opinião de visitas sobre o quarto', correct: false, feedback: 'O teste é uma avaliação pessoal de quem vive no espaço, não da opinião de terceiros.' },
      ],
      },
      {
        question: 'Segundo a aula, o que caracteriza a cadeira acumuladora?',
        answers: [
          { title: 'Uma cadeira que virou um segundo guarda-roupa, símbolo da decisão adiada', correct: true, feedback: 'Exatamente — é o símbolo clássico de roupas sem destino definido.' },
          { title: 'Uma cadeira usada apenas para sentar e descansar', correct: false, feedback: 'Pelo contrário — a cadeira acumuladora é disfuncional, cheia de roupas.' },
          { title: 'Uma cadeira nova comprada para o quarto', correct: false, feedback: 'O termo não se refere a comprar uma cadeira nova.' },
          { title: 'Uma cadeira localizada no closet', correct: false, feedback: 'A aula fala da cadeira no quarto, não no closet.' },
        ],
      },
      {
        question: 'O que a aula recomenda em relação às telas no quarto?',
        answers: [
          { title: 'Manter o celular fora da cabeceira e ter uma rotina noturna sem telas', correct: true, feedback: 'Isso mesmo — telas na cabeceira atrapalham o sono e a desaceleração da mente.' },
          { title: 'Assistir TV até dormir para relaxar', correct: false, feedback: 'A aula recomenda o oposto: reduzir telas antes de dormir.' },
          { title: 'Usar o celular como despertador ao lado da cama', correct: false, feedback: 'A recomendação é manter o celular fora do alcance imediato da cabeceira.' },
          { title: 'Nenhuma recomendação é feita sobre tecnologia', correct: false, feedback: 'A aula trata especificamente do tema tecnologia no quarto.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Aplique o checklist', description: 'Aplique o checklist completo no seu quarto hoje ou nos próximos dois dias. Use o Método das Ondas: um bloco de 40 minutos por vez.' },
        { title: 'Registre o antes e depois', description: 'Ao final, tire duas fotos: uma do antes e uma do depois. Guarde as duas — você vai querer ver essa comparação daqui a algumas semanas.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Com o quarto transformado, a próxima aula vai para o coração operacional da casa: a cozinha. É o espaço onde o dia converge — manhã, almoço, fim de tarde. Quando a cozinha funciona bem, tudo ao redor flui com menos atrito.',
  },
  'A cozinha funcional': {
    trilha: 'A cozinha funcional',
    intro: 'A cozinha é o coração operacional da casa. É onde o dia começa — o café da manhã apressado, a marmita que precisa ser preparada, a primeira xícara de chá em silêncio. É onde o fim do dia converge — o jantar, as conversas, a louça acumulada desde a manhã.',
    objectives: ['Compreender: o princípio central: organização por frequência de uso.', 'Reconhecer: as zonas de trabalho da cozinha.', 'Aplicar na prática: o problema da bancada.'],
    accordion: [
      { title: 'O princípio central: organização por frequência de uso', description: 'A maioria das cozinhas está organizada por categoria. Isso parece lógico, mas ignora algo fundamental: você não usa todas as panelas com a mesma frequência.\n\nUSO DIÁRIO — ao alcance das mãos, sem abrir nada\nO que você usa todo dia deve estar imediatamente acessível. A faca do dia a dia, a tábua de corte, o azeite, o sal, a xícara favorita. Sem precisar abrir gaveta, sem precisar se abaixar, sem precisar procurar.\n\nUSO SEMANAL — acessível, mas pode exigir um passo\nO que você usa toda semana pode estar numa gaveta ou armário de fácil acesso. Panelas regulares, temperos que entram na maioria das receitas.\n\nUSO OCASIONAL — pode estar menos acessível\nO que você usa raramente — a forma de bolo especial, o liquidificador de festas — pode ficar em prateleiras altas ou armários mais fundos.' },
      { title: 'As zonas de trabalho da cozinha', description: '🔪 ZONA DE PREPARO\nPróxima à bancada principal. Tábua de corte, facas, descascador, temperos de uso frequente, tigelas de preparo.\n\n🍳 ZONA DE COCÇÃO\nPróxima ao fogão. Panelas, frigideiras, espátulas, conchas, pegadores, luvas de forno. O que você usa durante o cozimento não deveria estar do outro lado da cozinha.\n\n🚿 ZONA DE HIGIENE\nPróxima à pia. Esponja, detergente, pano de prato, lixo.\n\n🥫 ZONA DE ARMAZENAMENTO\nDespensa e armários de alimentos. Organizada por categoria e frequência — o que você usa todo dia na frente, o que usa raramente no fundo.\n\n☕ ZONA DE BEBIDAS\nSe você toma café ou chá todos os dias, crie uma mini estação dedicada. Cafeteira, xícaras, açúcar, pó — tudo num único local. Esse pequeno sistema elimina vários passos desnecessários toda manhã.' },
      { title: 'O problema da bancada', description: 'A bancada é a superfície mais valiosa da cozinha — e a mais sabotada.\n\nUma bancada funcional tem apenas o que é usado todo dia: cafeteira, porta-utensílios com os essenciais, tábua de corte se você cozinha diariamente. Nada mais.\n\nO TESTE DA BANCADA: retire tudo que está sobre ela. Limpe a superfície. Agora devolva apenas o que você usa todos os dias. O que sobrou fora da bancada — encontre um lugar nos armários ou avalie se precisa mesmo estar na cozinha.' },
    ],
    example: 'Débora, 44 anos, dizia que odiava cozinhar. Evitava a cozinha, pedia delivery com frequência, sentia culpa por isso.\n\nQuando analisamos a cozinha dela, o problema ficou claro: a bancada tinha doze itens permanentes, as panelas que ela usava todo dia estavam no armário mais alto, e os temperos estavam espalhados em três lugares diferentes.\n\nEm uma tarde, reorganizamos por frequência de uso e criamos as zonas de trabalho. As panelas do dia a dia foram para o armário mais acessível. A bancada ficou com quatro itens. Os temperos ganharam um lugar único próximo ao fogão.\n\nDuas semanas depois, Débora disse algo que ficou: "Eu não odiei cozinhar essa semana. Acho que eu odiava o caos, não a comida."',
    flashcards: [
      { front: 'O princípio central: organização por frequência de uso', back: 'A maioria das cozinhas está organizada por categoria. Isso parece lógico, mas ignora algo fundamental: você não usa todas as panelas com a mesma frequência.', audioTranscript: null },
      { front: 'As zonas de trabalho da cozinha', back: '🔪 ZONA DE PREPARO\nPróxima à bancada principal. Tábua de corte, facas, descascador, temperos de uso frequente, tigelas de preparo.', audioTranscript: null },
      { front: 'O problema da bancada', back: 'A bancada é a superfície mais valiosa da cozinha — e a mais sabotada. Uma bancada funcional tem apenas o que é usado todo dia: cafeteira, porta-utensílios com os essenciais, tábua de corte se você cozinha diariamente.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual o princípio central para organizar uma cozinha funcional?',
      answers: [
        { title: 'Organizar por frequência de uso, não apenas por categoria', correct: true, feedback: 'Correto — agrupar por categoria parece lógico, mas o que realmente facilita o dia a dia é posicionar os itens conforme a frequência com que são usados.' },
        { title: 'Guardar tudo o mais longe possível da bancada', correct: false, feedback: 'Pelo contrário — os itens de uso diário devem ficar ao alcance, próximos da área de trabalho.' },
        { title: 'Organizar exclusivamente por cor dos utensílios', correct: false, feedback: 'Cor não é o critério funcional proposto — o foco é a frequência de uso.' },
        { title: 'Comprar organizadores antes de qualquer triagem', correct: false, feedback: 'Comprar organizadores não resolve a função — primeiro é preciso entender o que é usado com frequência.' },
      ],
      },
      {
        question: 'O que caracteriza a zona de cocção na cozinha?',
        answers: [
          { title: 'Fica próxima ao fogão, com panelas, espátulas e utensílios de cozimento', correct: true, feedback: 'Correto — tudo que se usa durante o cozimento deve estar perto do fogão.' },
          { title: 'Fica próxima à pia, com detergente e esponjas', correct: false, feedback: 'Essa é a zona de higiene, não a de cocção.' },
          { title: 'É onde ficam os alimentos guardados por categoria', correct: false, feedback: 'Essa é a zona de armazenamento, não a de cocção.' },
          { title: 'É a área reservada para café e chá', correct: false, feedback: 'Essa é a zona de bebidas, não a de cocção.' },
        ],
      },
      {
        question: 'Qual é o teste da bancada sugerido na aula?',
        answers: [
          { title: 'Retirar tudo da bancada e devolver apenas o que é usado todos os dias', correct: true, feedback: 'Isso mesmo — esse teste revela o que realmente precisa estar à vista na cozinha.' },
          { title: 'Medir o tamanho da bancada com fita métrica', correct: false, feedback: 'O teste não envolve medições, e sim triagem de itens.' },
          { title: 'Comparar sua bancada com fotos de revista', correct: false, feedback: 'O teste é prático e pessoal, não comparativo.' },
          { title: 'Cronometrar quanto tempo leva para limpar a bancada', correct: false, feedback: 'O foco do teste é o que fica ou sai da bancada, não o tempo de limpeza.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Mapeie sua cozinha atual (10 minutos)', description: 'Abra todos os armários e gavetas. Para cada grupo de objetos, pergunte: com que frequência uso isso? Diariamente, semanalmente ou raramente?' },
        { title: 'Identifique seus conflitos (10 minutos)', description: 'O que de uso diário está num lugar difícil de acessar? O que de uso raro está ocupando os melhores espaços? Anote os três maiores conflitos.' },
        { title: 'Faça as trocas prioritárias (25 minutos)', description: 'Resolva os três conflitos que você identificou. Não tente reorganizar tudo — resolva os pontos de maior impacto primeiro.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Com a cozinha reorganizada por função e frequência, a próxima aula vai para o closet — o espaço que define como você começa cada manhã. Você vai entender por que a maioria dos closets sabota a autoconfiança feminina diariamente, e vai aprender a criar um sistema que funciona para a sua vida real.',
  },
  'Closet sem culpa': {
    trilha: 'Closet sem culpa',
    intro: 'São 7h da manhã. Você abre o closet, tem dezenas de peças, e ainda assim sente que não tem nada para vestir. Fica olhando por minutos, experimenta três combinações, descarta tudo, e sai de casa com a sensação de derrota — antes das 8h da manhã.',
    objectives: ['Compreender: o que é fadiga de decisão.', 'Reconhecer: por que guardamos roupas que não usamos.', 'Aplicar na prática: o sistema bridge para o closet.'],
    accordion: [
      { title: 'O que é fadiga de decisão', description: 'Nosso cérebro toma milhares de micro-decisões por dia, e cada uma delas consome energia mental real. Essa reserva é finita — começa cheia pela manhã e vai sendo depletada ao longo do dia.\n\nO problema é que a maioria das pessoas gasta uma quantidade desproporcional dessa reserva logo cedo, na frente do closet, tomando decisões ruins sobre roupas que não servem bem, combinações que não funcionam, peças no lugar errado.\n\nUm closet que funciona não é um closet cheio. É um closet onde cada peça é uma boa opção — e onde encontrar o que você precisa leva menos de 30 segundos.' },
      { title: 'Por que guardamos roupas que não usamos', description: '"QUANDO EMAGRECER" — peças de tamanhos menores guardadas como meta ou punição. Elas não motivam — lembram diariamente de algo que você ainda não é. E ocupam espaço de roupas que te servem hoje.\n\n"FOI CARO, NÃO POSSO JOGAR FORA" — o custo já foi pago. Manter uma peça que você não usa não recupera o dinheiro — apenas ocupa espaço e energia mental.\n\n"PODE SER ÚTIL UM DIA" — o dia específico que justifique aquela peça raramente chega. E quando chega, você provavelmente vai comprar algo mais adequado.\n\n"É UMA LEMBRANÇA" — algumas peças têm valor afetivo real. Mas se você não as usa e elas não estão expostas como objeto de memória, estão apenas acumulando espaço e culpa.\n\n"VOU CONSERTAR" — a blusa com botão faltando, o vestido que precisa de ajuste. Se está esperando conserto há mais de 6 meses, a probabilidade de que isso aconteça é muito baixa.\n\nReconhecer esses padrões sem julgamento é o primeiro passo. Eles não são falhas de caráter — são mecanismos psicológicos comuns.' },
      { title: 'O sistema bridge para o closet', description: 'PASSO 1 — Esvazie completamente\nTire tudo do closet. Tudo. Coloque sobre a cama ou no chão. Você precisa ver o que tem antes de decidir o que fica.\n\nPASSO 2 — Aplique o filtro de três perguntas\nPara cada peça, responda honestamente:\n• Eu me sinto bem usando isso?\n• Eu usei essa peça nos últimos 12 meses?\n• Essa peça serve à minha vida hoje?\n\nSe a resposta for não em duas ou três perguntas: a peça sai.\n\nPASSO 3 — Organize por categoria e frequência\nDevolva as peças organizadas por categoria e dentro de cada categoria, por frequência de uso. O que você usa toda semana fica na frente e no centro.\n\nPASSO 4 — Crie um sistema de saída permanente\nColoque um cesto no fundo do closet dedicado a peças que você decide soltar ao longo do tempo. Quando uma peça não funcionar mais, vai direto para o cesto. Quando encher, você doa.\n\nPASSO 5 — Resolva as pendências\nAs peças que precisam de conserto: dê um prazo de 30 dias. Se não foram consertadas, saem.' },
      { title: 'Criando combinações que funcionam', description: 'Um closet que funciona não é só organizado — é combinável. Isso significa que a maioria das peças funciona com a maioria das outras.\n\nPerguntas para avaliar se seu closet é combinável:\n• Cada peça combina com pelo menos três outras peças que você tem?\n• Você tem mais peças neutras do que estampadas e coloridas?\n• Seus sapatos e bolsas funcionam com a maioria das suas roupas?\n\nSe a resposta for não para a maioria, você pode ter muitas peças e ainda assim poucas combinações — que é exatamente o que gera a sensação de "não tenho nada para vestir".' },
    ],
    example: 'Carolina, 39 anos, tinha um closet com mais de 200 peças e vivia com a sensação de não ter roupa. Toda manhã era uma batalha.\n\nQuando aplicou o sistema Bridge, saíram 87 peças. O que ficou foram 113 peças — mas todas que ela genuinamente usava e nas quais se sentia bem.\n\n"Parece que tenho mais roupa agora do que antes," ela disse, "porque consigo ver tudo e tudo funciona." Suas manhãs mudaram. Não porque ela ficou mais decidida — mas porque o closet parou de ser um campo minado de decisões ruins.',
    flashcards: [
      { front: 'O que é fadiga de decisão', back: 'Nosso cérebro toma milhares de micro-decisões por dia, e cada uma delas consome energia mental real. Essa reserva é finita — começa cheia pela manhã e vai sendo depletada ao longo do dia.', audioTranscript: null },
      { front: 'Por que guardamos roupas que não usamos', back: '"QUANDO EMAGRECER" — peças de tamanhos menores guardadas como meta ou punição. Elas não motivam — lembram diariamente de algo que você ainda não é.', audioTranscript: null },
      { front: 'O sistema bridge para o closet', back: 'PASSO 1 — Esvazie completamente\nTire tudo do closet. Tudo.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'O que é \'fadiga de decisão\', citada na aula sobre o closet?',
      answers: [
        { title: 'O esgotamento da energia mental causado por muitas micro-decisões ao longo do dia', correct: true, feedback: 'Isso mesmo — cada escolha consome um recurso mental finito, e um closet confuso aumenta essas decisões logo pela manhã.' },
        { title: 'O cansaço físico de dobrar roupas', correct: false, feedback: 'Fadiga de decisão é mental, não física — está relacionada ao esforço de escolher, não ao esforço de dobrar.' },
        { title: 'A indecisão sobre qual loja comprar roupas', correct: false, feedback: 'O conceito não é sobre compras, mas sobre o desgaste mental de decidir repetidamente ao longo do dia.' },
        { title: 'O tempo perdido procurando roupas no armário', correct: false, feedback: 'Procurar roupas é um sintoma relacionado, mas a fadiga de decisão em si é sobre o esgotamento da capacidade de escolher.' },
      ],
      },
      {
        question: 'Quais são as três perguntas do filtro do Sistema Bridge para o closet?',
        answers: [
          { title: 'Eu me sinto bem usando? Usei nos últimos 12 meses? Serve à minha vida hoje?', correct: true, feedback: 'Isso mesmo — essas três perguntas orientam a decisão sobre cada peça.' },
          { title: 'Quanto custou? É de marca? Está na moda?', correct: false, feedback: 'Essas perguntas não fazem parte do filtro proposto pela aula.' },
          { title: 'É bonita? Combina com a casa? Foi um presente?', correct: false, feedback: 'O filtro da aula foca em uso e sentimento atual, não nesses critérios.' },
          { title: 'Está na promoção? Cabe na mala? É impermeável?', correct: false, feedback: 'Esses critérios não aparecem no filtro do Sistema Bridge.' },
        ],
      },
      {
        question: 'Qual é o motivo listado na aula para guardar peças para quando emagrecer?',
        answers: [
          { title: 'Peças que não motivam e lembram diariamente de algo que a pessoa ainda não é', correct: true, feedback: 'Exato — a aula descreve esse padrão como algo que pesa emocionalmente, não motiva.' },
          { title: 'É a forma mais eficiente de economizar dinheiro', correct: false, feedback: 'A aula não apresenta essa prática como economia, e sim como um padrão que pesa emocionalmente.' },
          { title: 'É recomendado guardar essas peças por no mínimo 5 anos', correct: false, feedback: 'Não há essa recomendação — a aula sugere avaliar se a peça serve à vida atual.' },
          { title: 'É a categoria de roupa mais fácil de organizar', correct: false, feedback: 'A aula não trata disso como uma categoria fácil de organizar.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Prepare os destinos', description: 'Reserve uma manhã ou tarde de fim de semana. Separe: uma caixa para doação, uma sacola para descarte e uma pilha para conserto, com prazo de 30 dias.' },
        { title: 'Esvazie completamente', description: 'Tire tudo do closet e coloque sobre a cama. Você precisa ver o que tem antes de decidir o que fica.' },
        { title: 'Aplique o filtro de três perguntas', description: 'Para cada peça: eu me sinto bem usando isso? Usei nos últimos 12 meses? Serve à minha vida hoje? Duas respostas "não" já indicam que a peça pode sair.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Com quarto, cozinha e closet transformados, a próxima aula vai para os espaços compartilhados — sala, corredor, entrada. Você vai aprender como criar estruturas que funcionam mesmo quando outras pessoas da família ainda não aderiram à organização.',
  },
  'Sala e áreas comuns': {
    trilha: 'Sala e áreas comuns',
    intro: 'As áreas comuns da casa carregam um desafio único: são usadas por todos, mas organizadas quase sempre por uma pessoa só. A sala, o corredor, a entrada — esses espaços absorvem o fluxo de toda a família ao longo do dia, e sem sistemas claros, acumulam tudo que não tem lugar definido em nenhum outro cômodo. Quando as áreas comuns funcionam bem, o efeito é imediato e visível para toda a família.',
    objectives: ['Compreender: o princípio fundamental: todo objeto precisa de um endereço.', 'Reconhecer: a entrada da casa.', 'Aplicar na prática: a sala de estar.'],
    accordion: [
      { title: 'O princípio fundamental: todo objeto precisa de um endereço', description: 'Nas áreas comuns, o caos quase sempre tem a mesma raiz: objetos sem endereço fixo. Um endereço não é "em algum lugar na sala". É "nesta cesta, nesta prateleira, neste gancho específico".\n\nQuando cada objeto tem um endereço preciso, devolver é automático — não exige decisão, não exige esforço mental. Sem endereço fixo, cada objeto guardado vira uma micro-decisão. E micro-decisões repetidas criam fadiga — e eventualmente, abandono do sistema.\n\nA pergunta que deve guiar a organização: se alguém entrasse nesta casa pela primeira vez, sem nenhuma instrução, conseguiria encontrar e devolver qualquer objeto sem precisar perguntar?' },
      { title: 'A entrada da casa', description: 'A entrada é o primeiro e o último espaço que você experimenta todos os dias. É onde a transição acontece — de fora para dentro, do mundo para o lar.\n\nUma entrada funcional tem:\n\n🔑 UM LUGAR FIXO PARA CHAVES — gancho, tigela ou caixa pequena. Sempre no mesmo lugar. Sem exceção.\n\n👟 UM SISTEMA PARA SAPATOS — sapateira, cesto, tapete demarcado. Os sapatos ficam até aqui, não além.\n\n🎒 UM GANCHO OU CABIDEIRO — para bolsas, mochilas, casacos de uso frequente. O que você usa todo dia precisa de um lugar acessível perto da saída.\n\n📬 UMA SUPERFÍCIE DE TRIAGEM — para correspondências e itens temporários. Com uma regra clara: nada fica aqui por mais de 24 horas.' },
      { title: 'A sala de estar', description: 'Os maiores acumuladores da sala:\n\nSUPERFÍCIES HORIZONTAIS — mesa de centro, aparador, estantes. A regra: no máximo três itens intencionais sobre cada superfície.\n\nCONTROLES E CABOS — controles remotos, carregadores, fones. Crie um local único e fixo para todos eles. Uma cesta pequena resolve esse problema completamente.\n\nBRINQUEDOS E PERTENCES DAS CRIANÇAS — crie zonas claras e cestos identificados. As crianças conseguem seguir sistemas simples quando eles são óbvios.\n\nREVISTAS E PAPÉIS AVULSOS — um cesto dedicado para leitura em andamento e uma regra de descarte semanal resolve.' },
      { title: 'Checklist para suas áreas comuns', description: 'ENTRADA\n✅ As chaves têm um lugar fixo — sempre o mesmo, sem exceção\n✅ Os sapatos têm um sistema claro — não ficam espalhados além da zona definida\n✅ Bolsas e mochilas têm ganchos ou local definido\n✅ Correspondências têm uma superfície de triagem com prazo de 24h\n✅ A entrada, quando em ordem, transmite a sensação de "chegou, pode respirar"\n\nSALA DE ESTAR\n✅ As superfícies têm no máximo 3 itens intencionais cada\n✅ Controles remotos e cabos têm um local único e fixo\n✅ Brinquedos e pertences têm cestos ou zonas claramente definidas\n✅ Existe um sistema para leituras em andamento\n✅ Qualquer membro da família consegue repor os itens no lugar sem instrução\n\nGERAL\n✅ Todo objeto nas áreas comuns tem um endereço fixo e específico\n✅ Os sistemas são simples o suficiente para os dias cansativos\n✅ O espaço, quando em ordem, convida ao descanso e à conexão\n✅ Existe um ritual de reset rápido — diário ou semanal' },
      { title: 'O reset de 10 minutos', description: 'Todo dia, num horário fixo — geralmente antes do jantar ou antes de dormir — percorra as áreas comuns com uma cesta e devolva cada objeto ao seu endereço. Não limpe, não reorganize, não entre em projetos. Apenas devolva.\n\n10 minutos por dia evitam o colapso semanal que exige horas de reorganização.\n\nPara que o reset funcione com a família: torne visível e previsível. "Às 20h fazemos o reset juntos" funciona melhor do que "arruma quando lembrar". Crianças a partir de 4 anos conseguem participar — e quando participam desde cedo, desenvolvem o hábito naturalmente.' },
    ],
    example: 'Priscila, 40 anos, sentia que a sala nunca estava em ordem — apesar de passar horas organizando nos fins de semana. Na segunda-feira, já estava caótica de novo.\n\nO problema era claro: nenhum objeto tinha endereço fixo. Em uma tarde, criamos endereços para cada categoria: uma cesta para controles e cabos, dois cestos para os brinquedos do filho, uma tigela na entrada para chaves. Implementamos o reset de 10 minutos antes do jantar.\n\nTrês semanas depois: "A sala não está perfeita o tempo todo. Mas agora quando bagunça, a gente resolve em 10 minutos. Antes levava o fim de semana."',
    flashcards: [
      { front: 'O princípio fundamental: todo objeto precisa de um endereço', back: 'Nas áreas comuns, o caos quase sempre tem a mesma raiz: objetos sem endereço fixo. Um endereço não é "em algum lugar na sala".', audioTranscript: null },
      { front: 'A entrada da casa', back: 'A entrada é o primeiro e o último espaço que você experimenta todos os dias. É onde a transição acontece — de fora para dentro, do mundo para o lar.', audioTranscript: null },
      { front: 'A sala de estar', back: 'Os maiores acumuladores da sala:\n\nSUPERFÍCIES HORIZONTAIS — mesa de centro, aparador, estantes. A regra: no máximo três itens intencionais sobre cada superfície.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual é o princípio fundamental para organizar áreas comuns, segundo a aula?',
      answers: [
        { title: 'Todo objeto precisa de um endereço fixo e específico', correct: true, feedback: 'Exato — não basta um lugar vago como \'na sala\'; cada objeto precisa de um local exato e consistente.' },
        { title: 'Quanto mais cestos e caixas, melhor a organização', correct: false, feedback: 'A quantidade de cestos não é o ponto central — o que importa é que cada objeto tenha um endereço definido.' },
        { title: 'Esconder tudo dentro de armários fechados', correct: false, feedback: 'Esconder sem critério não resolve — o essencial é que o objeto tenha um destino claro e acessível.' },
        { title: 'Reorganizar a sala todos os dias', correct: false, feedback: 'A reorganização diária completa não é necessária — um endereço fixo elimina a necessidade de reorganizar com frequência.' },
      ],
      },
      {
        question: 'O que compõe uma entrada funcional, segundo a aula?',
        answers: [
          { title: 'Lugar fixo para chaves, sistema para sapatos, gancho para bolsas e superfície de triagem', correct: true, feedback: 'Isso mesmo — esses quatro elementos formam uma entrada funcional.' },
          { title: 'Um tapete grande e um espelho decorativo', correct: false, feedback: 'Esses itens não são os elementos centrais descritos na aula.' },
          { title: 'Uma mesa de jantar e cadeiras extras', correct: false, feedback: 'Isso não faz parte da definição de entrada funcional na aula.' },
          { title: 'Uma estante de livros organizada por cor', correct: false, feedback: 'Esse elemento não é mencionado na aula sobre a entrada da casa.' },
        ],
      },
      {
        question: 'Quanto tempo dura o reset de 10 minutos das áreas comuns?',
        answers: [
          { title: 'Cerca de 10 minutos, todo dia, num horário fixo', correct: true, feedback: 'Correto — a prática diária e breve evita o colapso semanal.' },
          { title: 'Uma hora, uma vez por mês', correct: false, feedback: 'O reset é diário e mais curto, não mensal.' },
          { title: 'Trinta minutos, apenas aos domingos', correct: false, feedback: 'A recomendação é diária, com duração de cerca de 10 minutos.' },
          { title: 'Não tem duração definida', correct: false, feedback: 'A aula recomenda um tempo específico: cerca de 10 minutos por dia.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Identifique o problema', description: 'Escolha uma área comum da casa. Qual objeto não tem um endereço fixo? Qual superfície está sempre acumulando coisas?' },
        { title: 'Dê um endereço a cada objeto', description: 'Defina um lugar específico — uma cesta, prateleira ou gancho — para cada categoria de objeto sem destino.' },
        { title: 'Teste com alguém de fora', description: 'Peça para alguém que não mora com você tentar encontrar e devolver um objeto sem instruções. Funcionou?' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Com os espaços físicos organizados, a última aula desta trilha vai para um tipo de desordem que não tem cômodo — mas que gera ansiedade em praticamente toda casa: os documentos e papéis. Você vai aprender um sistema simples e definitivo para acabar com esse caos de uma vez.',
  },
  'Documentos e papéis: fim do caos': {
    trilha: 'Documentos e papéis: fim do caos',
    intro: 'Existe um tipo de desordem que não ocupa espaço visível na sala, não bagunça o closet, não acumula na bancada da cozinha — mas que gera uma das ansiedades mais persistentes dentro de casa: a desordem de papéis. Contas que você não sabe se pagou. Documentos que precisam ser assinados.',
    objectives: ['Compreender: por que os papéis são tão difíceis de organizar.', 'Reconhecer: o sistema de 3 caixas bridge.', 'Aplicar na prática: criando seu arquivo permanente.'],
    accordion: [
      { title: 'Por que os papéis são tão difíceis de organizar', description: 'Os objetos físicos têm uma vantagem: você os vê. Uma pilha de roupas é visível, incomoda, pede ação. Um envelope fechado sobre a mesa parece inofensivo — até você abrir e descobrir que era uma notificação importante com prazo vencido.\n\nOs papéis também chegam em categorias muito diferentes misturadas: propaganda que vai direto para o lixo, conta que precisa ser paga até sexta, documento que precisa ser guardado por anos. Sem um sistema de triagem, tudo vai para a mesma pilha — e a pilha cresce até se tornar intimidadora demais para ser atacada.' },
      { title: 'O sistema de 3 caixas bridge', description: '📥 CAIXA DE ENTRADA\nPara onde vai absolutamente tudo que chega em papel. Correspondências, recibos, folhetos, documentos, notas fiscais. Tudo vai aqui primeiro, sem triagem imediata.\n\nA regra de ouro: nunca deixe papel em nenhum outro lugar da casa antes de passar pela caixa de entrada. A entrada centralizada é o que impede as pilhas espalhadas.\n\n📋 CAIXA DE AÇÃO\nItens que precisam de uma ação específica e com prazo. Conta para pagar, formulário para assinar, consulta para agendar.\n\nEsta caixa deve ser esvaziada uma vez por semana — num dia e horário fixos. O que não foi resolvido na semana anterior tem prioridade.\n\n🗂️ CAIXA DE ARQUIVO\nDocumentos que precisam ser guardados por mais tempo: contratos, documentos pessoais, comprovantes importantes, exames médicos, registros escolares.\n\nO QUARTO DESTINO — DESCARTE IMEDIATO\nPropagandas, folhetos, envelopes vazios, recibos sem importância. Vai direto para o lixo — sem passar pela caixa de entrada, sem criar pilha intermediária.' },
      { title: 'Criando seu arquivo permanente', description: 'As categorias que funcionam para a maioria das casas brasileiras:\n\n🏠 CASA — contratos de aluguel ou financiamento, condomínio, IPTU, documentos do imóvel\n💰 FINANÇAS — extratos importantes, comprovantes de pagamento, declaração de imposto de renda\n🏥 SAÚDE — exames, laudos, receitas médicas em uso, carteirinhas de plano de saúde\n📚 ESCOLA / TRABALHO — documentos escolares, diplomas, certificados, contratos de trabalho\n👤 DOCUMENTOS PESSOAIS — RG, CPF, passaporte, certidões, título de eleitor\n🚗 VEÍCULOS — documentos do carro, IPVA, seguro, revisões' },
      { title: 'A revolução do digital', description: 'O celular resolve a maioria dos arquivos. Aplicativos como Adobe Scan ou CamScanner transformam qualquer papel em PDF em segundos.\n\nCrie uma pasta no Google Drive com as mesmas categorias do arquivo físico. Gratuito, acessível de qualquer lugar, nunca se perde em enchente ou mudança.\n\nA regra: documento importante → digitaliza → arquiva fisicamente se necessário → descarta a cópia extra.' },
      { title: 'A rotina semanal de papéis', description: 'Uma vez por semana, reserve 15 a 20 minutos para:\n\n1. Triar a Caixa de Entrada — o que vai para Ação, Arquivo ou lixo\n2. Esvaziar a Caixa de Ação — pagar, assinar, agendar\n3. Arquivar a Caixa de Arquivo — distribuir nas pastas corretas\n4. Digitalizar o que vale guardar digitalmente\n\n20 minutos por semana. Esse é o investimento para nunca mais perder um documento importante, nunca mais pagar multa por conta esquecida, nunca mais sentir aquela ansiedade surda de "tem algo que eu deveria estar fazendo com esses papéis".' },
      { title: 'Trilha 2 concluída', description: 'Você agora tem sistemas funcionando em cada área da sua casa. Mas sistemas novos quebram. A vida acontece, as semanas ficam cheias, a casa volta a acumular. Isso não é fracasso — é previsível.\n\nA Trilha Simplificar vai um nível mais fundo: não apenas organizar o que existe, mas questionar o que precisa existir. Você vai aprender a arte de soltar o que não serve mais — objetos, compromissos, padrões mentais — para que os sistemas que você criou aqui possam respirar e durar. 🌿' },
    ],
    example: 'Andressa, 36 anos, tinha uma gaveta na cozinha que ela chamava de "a gaveta do caos" — onde iam todos os papéis que chegavam em casa. Em dois anos, acumulou mais de 400 documentos misturados: contas pagas e não pagas, exames médicos, manuais de eletrodomésticos, cardápios de delivery de 2019.\n\nQuando implementou o Sistema de 3 Caixas, a triagem inicial levou duas horas — mas foi feita uma única vez. Do que havia ali, 70% foi para o lixo imediatamente.\n\n"Parece que tirei um peso que eu nem sabia que estava carregando. Eu evitava aquela gaveta porque ela me lembrava de tudo que eu não tinha resolvido."',
    flashcards: [
      { front: 'Por que os papéis são tão difíceis de organizar', back: 'Os objetos físicos têm uma vantagem: você os vê. Uma pilha de roupas é visível, incomoda, pede ação.', audioTranscript: null },
      { front: 'O sistema de 3 caixas bridge', back: '📥 CAIXA DE ENTRADA\nPara onde vai absolutamente tudo que chega em papel. Correspondências, recibos, folhetos, documentos, notas fiscais.', audioTranscript: null },
      { front: 'Criando seu arquivo permanente', back: 'As categorias que funcionam para a maioria das casas brasileiras:\n\n🏠 CASA — contratos de aluguel ou financiamento, condomínio, IPTU, documentos do imóvel\n💰 FINANÇAS — extratos importantes, comprovantes de pagamento,...', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual é a função da \'Caixa de Entrada\' no sistema de 3 caixas Bridge?',
      answers: [
        { title: 'Receber absolutamente todo papel que chega em casa, sem triagem imediata', correct: true, feedback: 'Correto — a Caixa de Entrada é o primeiro destino de qualquer papel, evitando que ele se espalhe pela casa antes de ser triado.' },
        { title: 'Guardar permanentemente todos os documentos importantes', correct: false, feedback: 'Essa é a função do arquivo permanente, não da Caixa de Entrada, que é temporária.' },
        { title: 'Armazenar apenas contas já pagas', correct: false, feedback: 'A Caixa de Entrada recebe todo tipo de papel recém-chegado, não apenas contas pagas.' },
        { title: 'Substituir o arquivo digital', correct: false, feedback: 'A Caixa de Entrada é física e complementa, não substitui, a organização digital.' },
      ],
      },
      {
        question: 'Quais são as três caixas do Sistema Bridge para papéis?',
        answers: [
          { title: 'Caixa de Entrada, Caixa de Ação e Caixa de Arquivo', correct: true, feedback: 'Isso mesmo — essas três caixas organizam o fluxo de papéis da casa.' },
          { title: 'Caixa de Contas, Caixa de Fotos e Caixa de Recibos', correct: false, feedback: 'Essas categorias não correspondem ao sistema de três caixas da aula.' },
          { title: 'Caixa de Entrada, Caixa de Saída e Caixa de Reciclagem', correct: false, feedback: 'O sistema da aula usa Entrada, Ação e Arquivo, não essas três.' },
          { title: 'Caixa Digital, Caixa Física e Caixa de Backup', correct: false, feedback: 'Essa não é a estrutura de três caixas ensinada na aula.' },
        ],
      },
      {
        question: 'Com que frequência a Caixa de Ação deve ser esvaziada?',
        answers: [
          { title: 'Uma vez por semana, num dia e horário fixos', correct: true, feedback: 'Exato — esvaziar semanalmente evita acúmulo de pendências com prazo.' },
          { title: 'Uma vez por ano', correct: false, feedback: 'Essa frequência é baixa demais e geraria acúmulo de pendências urgentes.' },
          { title: 'Somente quando estiver completamente cheia', correct: false, feedback: 'A aula recomenda uma rotina fixa semanal, não esperar encher.' },
          { title: 'A cada 6 meses', correct: false, feedback: 'Itens de ação têm prazos, então a triagem precisa ser semanal, não semestral.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Monte seu sistema', description: 'Consiga três caixas ou cestos pequenos. Identifique: Entrada, Ação, Arquivo. Posicione num local acessível e visível.' },
        { title: 'A triagem inicial', description: 'Reúna todos os papéis espalhados pela casa. Coloque tudo na Caixa de Entrada. Depois faça a triagem: lixo, ação ou arquivo.' },
        { title: 'Monte suas pastas', description: 'Crie as pastas de arquivo com as categorias que fazem sentido para sua realidade.' },
        { title: 'Agende sua rotina semanal', description: 'Escolha o dia e horário. Coloque na agenda. Trate como compromisso fixo — porque é.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Reflita sobre o que essa aula revelou para você. Anote suas percepções e continue na sua travessia.',
  },
  'A arte de soltar o que não serve mais': {
    trilha: 'A arte de soltar o que não serve mais',
    intro: 'Você organizou. Criou sistemas. Transformou espaços.',
    objectives: ['Compreender: a psicologia do apego aos objetos.', 'Reconhecer: o custo real do excesso.', 'Aplicar na prática: a diferença entre simplicidade e privação.'],
    accordion: [
      { title: 'A psicologia do apego aos objetos', description: 'Guardar objetos "por precaução" é um dos padrões mais comuns e mais silenciosamente custosos nas casas brasileiras. Mas antes de tentar mudar esse padrão, é importante entendê-lo — porque ele não é irracional. Ele tem raízes profundas e legítimas.\n\nO EFEITO DOTAÇÃO\nPesquisas do psicólogo Daniel Kahneman mostram que as pessoas valorizam objetos que possuem de duas a três vezes mais do que objetos idênticos que não possuem. Só pelo fato de ser seu, um objeto ganha valor emocional desproporcional ao seu valor real.\n\nA MEMÓRIA AFETIVA\nObjetos não são apenas objetos. São portais para memórias, fases da vida, pessoas amadas, versões de nós mesmas que já fomos. O vestido do casamento não é tecido — é um dia inteiro de emoção. A xícara da avó não é cerâmica — é a presença dela nas manhãs de domingo.\n\nO MEDO DA ESCASSEZ\nPara quem cresceu em contexto de escassez real ou observou isso nos pais e avós, descartar objetos em bom estado vai contra um instinto de sobrevivência profundamente enraizado. "Guardar por precaução" foi, em algum momento da história familiar, uma estratégia inteligente.\n\nA IDENTIDADE FUTURA\nGuardamos roupas de tamanho menor, equipamentos de hobbies abandonados, livros de cursos que pretendemos fazer. Esses objetos representam versões futuras de nós mesmas — e descartá-los parece uma desistência.\n\nEntender esses mecanismos com compaixão é o primeiro passo. Você não é desorganizada porque guarda demais. Você é humana.' },
      { title: 'O custo real do excesso', description: 'CUSTO DE ESPAÇO — Objetos que não usamos ocupam espaço que poderia abrigar o que realmente importa. Cada metro quadrado da sua casa tem valor. Quando está ocupado por coisas sem uso, esse valor está sendo desperdiçado.\n\nCUSTO DE MANUTENÇÃO — Tudo que você possui precisa ser limpo, organizado, movido, mantido. Quanto mais objetos, mais trabalho invisível que consome tempo e energia.\n\nCUSTO COGNITIVO — Objetos sem uso funcionam como tarefas inacabadas na memória. Cada um é uma micro-decisão adiada que continua ocupando processamento mental.\n\nCUSTO EMOCIONAL — Objetos do passado que não nos servem mais podem nos manter presas em fases que já deveriam ter sido superadas. O vestido do "quando emagrecer" não motiva — lembra diariamente de algo que você ainda não é.\n\nSoltar não é perder. É uma escolha ativa sobre o que merece ocupar o espaço da sua vida agora.' },
      { title: 'A diferença entre simplicidade e privação', description: 'Simplificar não é se privar. Minimalismo radical não funciona para a maioria das pessoas, especialmente para famílias com crianças, com história afetiva rica, com vidas complexas.\n\nO que estamos propondo é curadoria intencional. Uma casa com curadoria intencional tem exatamente o que você precisa e o que te traz alegria real — nem mais, nem menos. Tem personalidade, tem história, tem afeto. Mas cada objeto que está ali foi escolhido — não apenas acumulado.' },
      { title: 'A pergunta que muda tudo', description: '"Este objeto serve à minha vida hoje?"\n\nNão à vida que tive. Não à vida que planejo ter. À vida que estou vivendo agora, nesta fase, com esta rotina, com este corpo, com estes valores.\n\nSe a resposta for sim — fica, com gratidão.\nSe a resposta for não — vai, com leveza.\n\nPara objetos com valor afetivo real, existe uma terceira opção: transformar em memória consciente. Um álbum, uma caixa de memórias curada, uma foto do objeto antes de doá-lo. Você guarda a memória sem precisar guardar o objeto.' },
    ],
    example: 'Simone, 45 anos, tinha uma casa com três quartos — e dois funcionavam como depósito. Toda vez que tentava organizar, se paralisava. "Parecia que jogar fora as coisas era jogar fora pedaços da minha vida."\n\nQuando mudamos a pergunta — de "posso jogar isso fora?" para "isso serve à minha vida hoje?" — algo mudou. Em três fins de semana, os dois quartos foram esvaziados. Saíram onze caixas para doação, quatro para descarte.\n\n"Eu chorei em vários momentos. Mas era um choro de leveza, não de perda. Parecia que eu estava me despedindo de fases com gratidão, em vez de carregá-las para sempre."',
    flashcards: [
      { front: 'A psicologia do apego aos objetos', back: 'Guardar objetos "por precaução" é um dos padrões mais comuns e mais silenciosamente custosos nas casas brasileiras. Mas antes de tentar mudar esse padrão, é importante entendê-lo — porque ele não é irracional.', audioTranscript: null },
      { front: 'O custo real do excesso', back: 'CUSTO DE ESPAÇO — Objetos que não usamos ocupam espaço que poderia abrigar o que realmente importa. Cada metro quadrado da sua casa tem valor.', audioTranscript: null },
      { front: 'A diferença entre simplicidade e privação', back: 'Simplificar não é se privar. Minimalismo radical não funciona para a maioria das pessoas, especialmente para famílias com crianças, com história afetiva rica, com vidas complexas.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual pergunta a aula propõe como guia central para decidir o que manter?',
      answers: [
        { title: '"Este objeto serve à minha vida hoje?"', correct: true, feedback: 'Isso mesmo — a pergunta foca na vida atual, não na vida passada ou em planos futuros incertos.' },
        { title: '"Quanto este objeto custou?"', correct: false, feedback: 'O valor de compra não é o critério proposto — o foco está na utilidade presente, não no preço pago.' },
        { title: '"Algum dia vou precisar disso?"', correct: false, feedback: 'Essa pergunta hipotética é justamente o padrão que a aula busca desconstruir, por manter o acúmulo \'por precaução\'.' },
        { title: '"O que as outras pessoas vão achar?"', correct: false, feedback: 'A decisão proposta é pessoal e interna, não baseada na opinião alheia.' },
      ],
      },
      {
        question: 'O que é o efeito dotação, citado na aula com base em Daniel Kahneman?',
        answers: [
          { title: 'A tendência de valorizar mais objetos que possuímos do que objetos idênticos que não possuímos', correct: true, feedback: 'Isso mesmo — só por ser nosso, o objeto ganha valor emocional desproporcional.' },
          { title: 'A tendência de comprar sempre em promoção', correct: false, feedback: 'Esse não é o efeito descrito — o efeito dotação é sobre posse, não preço.' },
          { title: 'O hábito de doar objetos regularmente', correct: false, feedback: 'O efeito dotação é sobre valorizar excessivamente o que já se possui, não sobre doar.' },
          { title: 'A necessidade de comprar objetos de marca', correct: false, feedback: 'Esse conceito não tem relação com o efeito dotação apresentado na aula.' },
        ],
      },
      {
        question: 'Qual é a pergunta que muda tudo, segundo a aula?',
        answers: [
          { title: 'Este objeto serve à minha vida hoje?', correct: true, feedback: 'Correto — essa pergunta direciona o olhar para a vida atual, não para o passado ou o futuro.' },
          { title: 'Quanto este objeto vale no mercado?', correct: false, feedback: 'O valor de revenda não é o critério central apresentado nessa aula.' },
          { title: 'Meus amigos aprovariam este objeto?', correct: false, feedback: 'A opinião de terceiros não é o critério proposto pela aula.' },
          { title: 'Esse objeto é o mais bonito que tenho?', correct: false, feedback: 'A estética isolada não é o critério apresentado como decisivo.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Valor afetivo genuíno?', description: 'Esse objeto tem valor afetivo real? Se sim, considere transformá-lo em memória consciente — uma foto ou um álbum — em vez de guardá-lo fisicamente.' },
        { title: 'Está em bom estado?', description: 'Se está em bom estado mas você não usa mais, o destino é doação.' },
        { title: 'Está muito desgastado?', description: 'Se está desgastado e sem uso, o destino é descarte responsável.' },
        { title: 'Tem valor de revenda?', description: 'Se tem valor de revenda real, considere vender em plataformas como Enjoei, OLX ou grupos de brechó.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Agora que você entende a psicologia por trás do apego e tem a pergunta central para guiar suas decisões, a próxima aula vai te dar um método estruturado para o descarte intencional — passo a passo, sem culpa e sem a paralisia que costuma acompanhar esse processo.',
  },
  'Método Bridge de descarte intencional': {
    trilha: 'Método Bridge de descarte intencional',
    intro: 'Na aula anterior, você entendeu por que soltar é difícil — e por que vale a pena fazer. Agora vamos para o como. O descarte intencional falha na maioria das vezes não por falta de vontade, mas por falta de estrutura.',
    objectives: ['Compreender: antes de começar: preparando o ambiente.', 'Reconhecer: os 4 filtros do método bridge.', 'Aplicar na prática: a tabela de decisão.'],
    accordion: [
      { title: 'Antes de começar: preparando o ambiente', description: 'Escolha o momento certo — não faça descarte quando estiver cansada ou estressada. Reserve um momento com energia e tranquilidade.\n\nPrepare os destinos antes — tenha prontas: uma caixa para doação, uma sacola para descarte, uma área para venda, e um espaço para itens que voltam para o lugar.\n\nTrabalhe por categoria, não por cômodo — reúna todos os objetos da mesma categoria antes de decidir. Ao ver todas as suas canecas juntas, fica muito mais fácil perceber que você tem dezessete e usa quatro.\n\nDefina um tempo — sessões de 45 a 60 minutos são ideais. Mais do que isso, a fadiga de decisão aumenta e a qualidade das escolhas cai.' },
      { title: 'Os 4 filtros do método bridge', description: 'FILTRO 1 — FREQUÊNCIA DE USO\nEu usei este item nos últimos 12 meses?\n\nSe não consegue lembrar quando foi a última vez, a resposta já está ali. Atenção às exceções legítimas: itens sazonais, itens de emergência, itens com uso específico mas real.\n\nFILTRO 2 — VALOR REAL\nEste objeto me traz alegria genuína ou tem utilidade concreta na minha vida atual?\n\nNão na vida que imagino ter. Na vida que estou vivendo agora. Uma dica: segure o objeto nas mãos por alguns segundos antes de responder. Nosso corpo muitas vezes sabe antes da nossa mente.\n\nFILTRO 3 — SUBSTITUIBILIDADE\nSe eu precisasse deste item amanhã e não o tivesse, conseguiria substituí-lo facilmente e sem grande custo?\n\nSe a resposta for sim — você pode soltar sem medo. O objeto é substituível. O espaço que ele ocupa hoje não é.\n\nFILTRO 4 — CUSTO DE MANTER\nQual é o espaço, energia e atenção que este objeto exige de mim? Vale a pena?\n\nAlguns objetos têm um custo de manutenção desproporcional ao benefício que oferecem. Este filtro ajuda a perceber o custo invisível de cada objeto.' },
      { title: 'A tabela de decisão', description: '✅ Uso com frequência e traz valor real → FICA\n❌ Não uso há mais de 12 meses e é substituível → SAI\n💛 Tem valor afetivo genuíno → FICA OU VIRA MEMÓRIA CONSCIENTE\n🎁 Está em bom estado mas não serve mais → DOAÇÃO\n🗑️ Está desgastado e sem uso → DESCARTE\n💰 Tem valor de revenda → VENDA\n🪡 Precisa de conserto há mais de 6 meses → PRAZO DE 30 DIAS OU DESCARTE' },
      { title: 'Os destinos do descarte intencional', description: 'DOAÇÃO — Para itens em bom estado. Opções: amigos e família, brechós físicos, instituições de caridade, grupos de doação no WhatsApp da sua cidade. Defina uma data — no máximo 7 dias — para entregar. Não guarde a caixa em casa por semanas.\n\nVENDA — Para itens com valor de revenda real. Enjoei para roupas e acessórios, OLX para móveis e eletrônicos. Defina um prazo de 30 dias — se não vendeu, doa.\n\nDESCARTE RESPONSÁVEL — Para itens muito desgastados. Eletrodomésticos e eletrônicos têm pontos de coleta específicos. Roupas muito desgastadas podem virar panos de limpeza antes do descarte final.\n\nMEMÓRIA CONSCIENTE — Para itens com valor afetivo real que você decide não guardar fisicamente. Fotografe antes de soltar. Crie uma pasta digital "Memórias" para essas fotos.' },
      { title: 'O sistema de saída permanente', description: 'Mantenha sempre uma cesta aberta num canto discreto da casa. Toda vez que perceber que algo não te serve mais, vai direto para a cesta. Quando encher, você doa — sem triagem adicional, sem segunda análise.\n\nEsse sistema cria um fluxo de saída contínuo que impede o reacúmulo — e torna o descarte algo natural, não um evento traumático semestral.' },
      { title: 'Checklist desta aula', description: 'ANTES DE COMEÇAR\n✅ Escolhi um momento com energia e tranquilidade\n✅ Tenho caixa de doação, sacola de descarte e área de venda prontas\n✅ Escolhi trabalhar por categoria, não por cômodo\n✅ Defini um tempo máximo de 60 minutos para esta sessão\n\nDURANTE O DESCARTE\n✅ Estou aplicando os filtros na ordem, um objeto por vez\n✅ Não estou colocando nada "de volta por enquanto" — a decisão é tomada agora\n✅ Itens de doação têm data definida para sair de casa\n✅ Itens de venda têm prazo de 30 dias — depois disso, doação\n\nDEPOIS DO DESCARTE\n✅ Tirei foto do espaço transformado\n✅ A caixa de doação tem destino e prazo definidos\n✅ Criei ou alimentei minha cesta de saída permanente' },
    ],
    example: 'Luciana, 38 anos, tentou fazer descarte três vezes nos últimos dois anos. Todas as vezes, parou no meio. "Eu pegava uma coisa, ficava em dúvida, colocava de volta. Ficava exausta sem ter descartado nada."\n\nQuando aplicou os 4 filtros do Método Bridge, algo mudou. "Ter uma sequência tirou a paralisia. Eu não precisava decidir tudo ao mesmo tempo — só precisava responder uma pergunta de cada vez."\n\nEm duas sessões de 45 minutos, ela esvaziou o closet de um quarto inteiro. "O que me surpreendeu foi que não me arrependi de nada. Quando você toma a decisão com critério, ela fica clara."',
    flashcards: [
      { front: 'Antes de começar: preparando o ambiente', back: 'Escolha o momento certo — não faça descarte quando estiver cansada ou estressada. Reserve um momento com energia e tranquilidade.', audioTranscript: null },
      { front: 'Os 4 filtros do método bridge', back: 'FILTRO 1 — FREQUÊNCIA DE USO\nEu usei este item nos últimos 12 meses? Se não consegue lembrar quando foi a última vez, a resposta já está ali.', audioTranscript: null },
      { front: 'A tabela de decisão', back: '✅ Uso com frequência e traz valor real → FICA\n❌ Não uso há mais de 12 meses e é substituível → SAI\n💛 Tem valor afetivo genuíno → FICA OU VIRA MEMÓRIA CONSCIENTE\n🎁 Está em bom estado mas não serve mais → DOAÇÃO\n🗑️ Está...', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual é o primeiro dos 4 filtros do Método Bridge?',
      answers: [
        { title: 'Frequência de uso — "Eu usei este item nos últimos 12 meses?"', correct: true, feedback: 'Correto — esse é o primeiro filtro, com atenção a exceções legítimas como itens sazonais.' },
        { title: 'Valor de revenda do item', correct: false, feedback: 'O valor de revenda pode ser considerado depois, mas não é o primeiro filtro do método.' },
        { title: 'Opinião da família sobre o item', correct: false, feedback: 'A decisão é guiada por critérios pessoais de uso e valor, não pela opinião de terceiros.' },
        { title: 'Cor ou estética do objeto', correct: false, feedback: 'Estética não é um dos 4 filtros do método — o foco é uso, valor afetivo e estado de conservação.' },
      ],
      },
      {
        question: 'Quais são os 4 filtros do Método Bridge de descarte?',
        answers: [
          { title: 'Frequência de uso, valor real, substituibilidade e custo de manter', correct: true, feedback: 'Isso mesmo — esses quatro filtros orientam a decisão sobre cada objeto.' },
          { title: 'Preço, marca, cor e tamanho', correct: false, feedback: 'Esses critérios não fazem parte dos 4 filtros ensinados na aula.' },
          { title: 'Peso, textura, cheiro e som', correct: false, feedback: 'Esses atributos sensoriais não são os filtros propostos pela aula.' },
          { title: 'Idade do objeto, local de compra, garantia e embalagem', correct: false, feedback: 'Esses fatores não correspondem aos 4 filtros do método.' },
        ],
      },
      {
        question: 'Segundo a aula, qual é o prazo recomendado para itens colocados à venda?',
        answers: [
          { title: '30 dias — se não vendeu, vai para doação', correct: true, feedback: 'Exato — esse prazo evita que os itens fiquem indefinidamente parados esperando venda.' },
          { title: '1 ano, sem prazo de doação', correct: false, feedback: 'O prazo recomendado é bem menor: 30 dias antes de partir para doação.' },
          { title: 'Apenas até o fim de semana', correct: false, feedback: 'O prazo sugerido na aula é de 30 dias, não apenas um fim de semana.' },
          { title: 'Não há prazo — o item pode ficar à venda indefinidamente', correct: false, feedback: 'A aula define um prazo claro de 30 dias para evitar acúmulo.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Escolha o momento certo', description: 'Não faça descarte cansada ou estressada. Reserve um momento com energia e tranquilidade, e separe os destinos: doação, descarte, venda.' },
        { title: 'Trabalhe por categoria', description: 'Reúna todos os objetos da mesma categoria antes de decidir — por exemplo, todas as canecas juntas. Fica mais fácil perceber excessos.' },
        { title: 'Aplique os 4 filtros', description: 'Para cada objeto, passe pelos quatro filtros da aula: frequência de uso, valor real, substituibilidade e custo de manter.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Com o método de descarte intencional em mãos, a próxima aula vai para uma dimensão que a maioria das pessoas não considera quando pensa em simplificar: a sobrecarga mental. Porque a desordem mais pesada muitas vezes não está nos armários — está na cabeça.',
  },
  'Simplificando a rotina mental': {
    trilha: 'Simplificando a rotina mental',
    intro: 'Você aprendeu a simplificar os espaços físicos. Aprendeu a avaliar objetos, a criar sistemas, a soltar o que não serve mais. Mas existe uma forma de desordem que nenhuma reorganização de armário resolve.',
    objectives: ['Compreender: o que é sobrecarga mental.', 'Reconhecer: por que a sobrecarga mental sabota tudo o mais.', 'Aplicar na prática: as quatro estratégias de simplificação mental.'],
    accordion: [
      { title: 'O que é sobrecarga mental', description: 'A sobrecarga mental tem um nome técnico: carga cognitiva excessiva. É o estado em que a quantidade de informação que seu cérebro precisa gerenciar simultaneamente supera sua capacidade de processamento eficiente.\n\nNo contexto doméstico, essa sobrecarga se manifesta como:\n\nA LISTA MENTAL PERMANENTE — compromissos, recados, compras, ligações a fazer. Tudo guardado na memória porque não há um sistema externo confiável.\n\nAS DECISÕES REPETIDAS — o que cozinhar hoje, o que vestir amanhã. Decisões que poderiam ser sistematizadas mas são tomadas do zero todos os dias.\n\nOS COMPROMISSOS NÃO ESCOLHIDOS — reuniões que você não precisava estar, eventos que você foi por obrigação, tarefas que assumiu porque não soube dizer não.\n\nAS PREOCUPAÇÕES CIRCULARES — pensamentos sobre problemas que você não pode resolver agora. O cérebro em loop consome energia como um aplicativo rodando em segundo plano.\n\nA SÍNDROME DA MULHER QUE LEMBRA DE TUDO — nas famílias, frequentemente uma pessoa assume a função de gerenciar a memória coletiva: aniversários, consultas médicas, prazos escolares. Isso tem nome: carga mental invisível. E tem um custo real.' },
      { title: 'Por que a sobrecarga mental sabota tudo o mais', description: 'Existe um fenômeno estudado pelo psicólogo Roy Baumeister chamado depleção do ego: nossa capacidade de tomar boas decisões e manter foco é um recurso finito que se esgota ao longo do dia.\n\nQuando esse recurso é consumido com o trivial — decisões desnecessárias, preocupações circulares, compromissos que não deveriam ser seus — sobra menos para o essencial.\n\nÉ por isso que mulheres sobrecarregadas mentalmente frequentemente sentem que "não têm energia" para as coisas que mais importam. Não é falta de força de vontade. É esgotamento de um recurso cognitivo real.' },
      { title: 'As quatro estratégias de simplificação mental', description: 'ESTRATÉGIA 1 — EXTERNALIZE TUDO\nFaça uma lista completa de tudo que está circulando na sua cabeça agora — tarefas, preocupações, compromissos, ideias, recados, pendências. Tudo, sem filtro.\n\nEsse exercício — o mind dump — tem um efeito imediato: quando algo está no papel, seu cérebro pode parar de trabalhar para "lembrar" e liberar essa energia para outras coisas.\n\nESTRATÉGIA 2 — REDUZA DECISÕES DIÁRIAS\nCada decisão trivial que você elimina preserva energia para decisões que importam.\n\n• Refeições da semana planejadas no domingo — elimina sete decisões diárias\n• Roupas separadas na noite anterior — elimina a batalha matinal do closet\n• Lista de compras atualizada em tempo real — elimina o esforço de lembrar o que falta\n• Rotina matinal fixa — os primeiros 30 minutos no piloto automático liberam energia para o que vem depois\n\nESTRATÉGIA 3 — CRIE FRONTEIRAS COM A TECNOLOGIA\nPesquisas mostram que uma interrupção de 3 segundos pode exigir até 23 minutos para recuperação completa do foco.\n\n• Desative todas as notificações que não são urgentes\n• Estabeleça dois ou três momentos fixos no dia para checar mensagens\n• Crie uma política de "não perturbe" nas refeições, primeiros 30 minutos da manhã e última hora antes de dormir\n• Remova da tela inicial os aplicativos que mais consomem atenção de forma não intencional\n\nESTRATÉGIA 4 — REDISTRIBUA A CARGA MENTAL INVISÍVEL\nA carga mental invisível não é uma responsabilidade natural das mulheres. É um papel que foi assumido e que pode ser redistribuído.\n\n• Torne visível o invisível — faça uma lista de tudo que você gerencia mentalmente pela família\n• Crie sistemas compartilhados — agenda digital acessível a todos, lista de compras compartilhada\n• Transfira com intenção — não "me ajuda mais", mas "a partir de agora, você é responsável por isso"\n• Resista ao impulso de assumir de volta — diferente não é errado' },
      { title: 'O diário como ferramenta de simplificação', description: 'Escrever regularmente é uma das ferramentas mais poderosas de simplificação mental. Pesquisas do psicólogo James Pennebaker mostram que pessoas que escrevem sobre experiências difíceis por apenas 15 minutos por dia durante quatro dias apresentam melhora significativa em saúde mental e clareza cognitiva.\n\nVocê não precisa de um método elaborado. Pode ser:\n• Três coisas que estão na sua cabeça antes de dormir\n• Uma pergunta que você responde para si mesma toda manhã\n• Um registro livre do que você está sentindo e pensando' },
    ],
    example: 'Renata, 41 anos, era conhecida na família como "a que lembra de tudo". Sabia os aniversários de todos, os prazos das contas, as consultas dos filhos. "Eu me orgulhava disso. Mas estava sempre exausta. Dormia mal. Acordava já pensando na lista do dia."\n\nQuando mapeamos tudo que ela gerenciava mentalmente, foram 47 itens — loops abertos na sua cabeça, simultaneamente.\n\nSeis semanas depois de externalizar, redistribuir e eliminar: "Pela primeira vez em anos, consigo sentar e ler por uma hora sem minha cabeça ir para outro lugar. Parece que ganhei uma parte de mim de volta."',
    flashcards: [
      { front: 'O que é sobrecarga mental', back: 'A sobrecarga mental tem um nome técnico: carga cognitiva excessiva. É o estado em que a quantidade de informação que seu cérebro precisa gerenciar simultaneamente supera sua capacidade de processamento eficiente.', audioTranscript: null },
      { front: 'Por que a sobrecarga mental sabota tudo o mais', back: 'Existe um fenômeno estudado pelo psicólogo Roy Baumeister chamado depleção do ego: nossa capacidade de tomar boas decisões e manter foco é um recurso finito que se esgota ao longo do dia. Quando esse recurso é consumido...', audioTranscript: null },
      { front: 'As quatro estratégias de simplificação mental', back: 'ESTRATÉGIA 1 — EXTERNALIZE TUDO\nFaça uma lista completa de tudo que está circulando na sua cabeça agora — tarefas, preocupações, compromissos, ideias, recados, pendências. Tudo, sem filtro.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'O que é a \'carga mental invisível\' mencionada na aula?',
      answers: [
        { title: 'A função de gerenciar mentalmente compromissos e prazos da família, muitas vezes assumida silenciosamente por uma pessoa', correct: true, feedback: 'Exato — é o trabalho invisível de lembrar de tudo pela família, que tem um custo cognitivo real mesmo sem ser percebido como \'trabalho\'.' },
        { title: 'O peso físico de carregar objetos pela casa', correct: false, feedback: 'Não é sobre peso físico — é sobre a sobrecarga mental de gerenciar informações e compromissos.' },
        { title: 'A quantidade de tarefas domésticas manuais', correct: false, feedback: 'Vai além das tarefas manuais — é especificamente sobre o trabalho mental de lembrar e organizar tudo.' },
        { title: 'O tempo gasto em redes sociais', correct: false, feedback: 'Esse conceito não está relacionado a redes sociais, mas à gestão mental de responsabilidades familiares.' },
      ],
      },
      {
        question: 'O que é o mind dump sugerido na Estratégia 1 de simplificação mental?',
        answers: [
          { title: 'Escrever tudo que está circulando na cabeça, sem filtro', correct: true, feedback: 'Isso mesmo — externalizar tudo no papel libera o cérebro de tentar lembrar de tudo.' },
          { title: 'Apagar todas as notificações do celular de uma vez', correct: false, feedback: 'Isso faz parte de outra estratégia (fronteiras com tecnologia), não do mind dump.' },
          { title: 'Jogar fora objetos que não são mais usados', correct: false, feedback: 'O mind dump é sobre externalizar pensamentos, não descartar objetos.' },
          { title: 'Meditar por uma hora todos os dias', correct: false, feedback: 'O mind dump é um exercício de escrita, não de meditação prolongada.' },
        ],
      },
      {
        question: 'Segundo a pesquisa de Roy Baumeister citada na aula, o que é depleção do ego?',
        answers: [
          { title: 'O esgotamento progressivo da capacidade de tomar boas decisões ao longo do dia', correct: true, feedback: 'Correto — é um recurso mental finito que vai se esgotando conforme o dia avança.' },
          { title: 'A perda de memória causada pelo envelhecimento', correct: false, feedback: 'Esse conceito não tem relação com envelhecimento, e sim com esgotamento de decisões diárias.' },
          { title: 'O aumento da autoestima ao longo do dia', correct: false, feedback: 'É o oposto — a depleção do ego é um esgotamento, não um ganho.' },
          { title: 'A dificuldade de dormir à noite', correct: false, feedback: 'O conceito trata da capacidade de decisão, não diretamente do sono.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'O MIND DUMP (15 minutos)', description: 'Pegue papel e caneta. Escreva tudo que está na sua cabeça agora — tarefas, preocupações, compromissos, pendências, ideias. Tudo, sem filtro, sem ordem.' },
        { title: 'A TRIAGEM (10 minutos)', description: 'Classifique cada item:\n🔴 Ação urgente — precisa ser feito nos próximos 3 dias\n🟡 Ação futura — importante, mas não urgente\n🟢 Pode ser delegado — não precisa ser você\n⚪ Pode ser eliminado — não é realmente necessário\n🔵 Preocupação sem ação possível agora — pode ser solta' },
        { title: 'UMA SIMPLIFICAÇÃO CONCRETA', description: 'Das quatro estratégias, escolha uma para implementar esta semana:\n• Fazer o planejamento de refeições no próximo domingo\n• Desativar notificações desnecessárias hoje\n• Criar um sistema compartilhado de agenda ou lista de compras\n• Iniciar o hábito de escrever 10 minutos antes de dormir' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Com a mente mais leve, a próxima aula vai tratar de algo que alimenta diretamente o reacúmulo — tanto físico quanto mental: o consumo. Porque simplificar perde sentido se continuamos trazendo para dentro de casa mais do que retiramos. Você vai entender os mecanismos por trás do consumo excessivo e aprender princípios concretos para comprar menos e melhor — sem privação e sem culpa.',
  },
  'Consumo consciente: comprando menos e melhor': {
    trilha: 'Consumo consciente: comprando menos e melhor',
    intro: 'Organizar e simplificar perde sentido se continuamos trazendo para dentro de casa mais do que retiramos. A raiz de muito do acúmulo doméstico não é falta de organização. É excesso de consumo.',
    objectives: ['Compreender: como o consumo excessivo acontece.', 'Reconhecer: o custo real do consumo excessivo.', 'Aplicar na prática: a diferença entre necessidade, desejo e impulso.'],
    accordion: [
      { title: 'Como o consumo excessivo acontece', description: 'A ESCASSEZ ARTIFICIAL — "Últimas unidades!", "Oferta por tempo limitado!". A urgência criada artificialmente ativa o sistema de ameaça do cérebro e acelera decisões que deveriam ser lentas.\n\nA DOPAMINA DA ANTECIPAÇÃO — Pesquisas mostram que o prazer de antecipar uma compra é frequentemente maior do que o prazer de receber o produto. O cérebro libera dopamina no momento da compra — não necessariamente no momento do uso. É por isso que comprar alivia temporariamente — e por isso que o alívio não dura.\n\nAS INFLUENCIADORAS E O "MUST-HAVE" SEMANAL — A lógica das redes sociais transforma o consumo em identidade e pertencimento. Não é sobre o produto — é sobre quem você quer ser ao ter aquele produto.\n\nA FACILIDADE DO DIGITAL — Comprar ficou tão fácil que a fricção que antes existia desapareceu. Um clique, parcelado em doze vezes, entrega em casa. A facilidade remove as pausas naturais onde a reflexão aconteceria.\n\nAS PROMOÇÕES QUE "ECONOMIZAM" DINHEIRO — Comprar três pelo preço de dois de algo que você usaria um. O desconto faz parecer inteligente o que é, na prática, gastar mais.' },
      { title: 'O custo real do consumo excessivo', description: 'CUSTO FINANCEIRO — Dinheiro gasto em objetos que não usa é dinheiro que não foi para experiências, segurança, sonhos.\n\nCUSTO DE ESPAÇO — Cada objeto comprado precisa de um lugar para ficar. Quando os espaços estão cheios, a casa deixa de respirar — e você também.\n\nCUSTO DE TEMPO — Pesquisar, comprar, receber, guardar, usar, limpar, manter, descartar. Cada objeto traz uma cadeia de tempo que raramente calculamos antes de comprar.\n\nCUSTO DE CLAREZA — Ambientes sobrecarregados dificultam a clareza mental. Menos objetos significa menos ruído visual, menos manutenção, mais espaço para o que realmente importa.' },
      { title: 'A diferença entre necessidade, desejo e impulso', description: 'NECESSIDADE — algo que sua vida real, concreta, atual exige. Tem critérios objetivos.\n\nDESEJO — algo que você genuinamente quer e que vai trazer prazer ou valor real à sua vida. Desejos são legítimos — fazem parte de uma vida rica e intencional.\n\nIMPULSO — algo que você quer agora, impulsionada por um gatilho externo (promoção, influenciadora, tédio, ansiedade) ou interno (estresse, tristeza, euforia). Impulsos passam. O objeto fica.\n\nA maioria das compras que gera arrependimento e acúmulo é de impulso — não de necessidade ou desejo genuíno.' },
      { title: 'Os cinco princípios do consumo consciente', description: 'PRINCÍPIO 1 — A REGRA DO ESPAÇO\nAntes de comprar qualquer item novo, identifique onde ele vai ficar na sua casa — não "em algum lugar", mas onde exatamente. Se não há um lugar claro e específico, ele não entra.\n\nPRINCÍPIO 2 — A ESPERA DE 72 HORAS\nPara qualquer compra não essencial, espere 72 horas antes de finalizar. A maioria dos impulsos de compra se dissolve nesse período. O que sobrevive tem muito mais chance de ser um desejo genuíno.\n\nPRINCÍPIO 3 — A PERGUNTA DAS CINCO VEZES\nAntes de comprar, pergunte "para quê?" e responda cinco vezes, progressivamente. Cada resposta revela uma camada mais profunda da motivação real. Às vezes confirma a compra. Frequentemente revela que o objeto não é a solução para o que você realmente precisa.\n\nPRINCÍPIO 4 — QUALIDADE SOBRE QUANTIDADE\nUm item bom que dura dez anos custa menos em dinheiro, espaço e energia mental do que cinco itens baratos que precisam ser substituídos a cada dois anos.\n\nPRINCÍPIO 5 — UM ENTRA, UM SAI\nPara cada item novo que entra na casa, um item equivalente sai. Uma roupa nova — uma roupa antiga vai para a cesta de doação. Esse princípio mantém o equilíbrio do volume de objetos e cria consciência natural antes de cada compra.' },
      { title: 'Consumo consciente não é nunca comprar', description: 'É escolher com intenção. É saber a diferença entre uma compra que vai enriquecer sua vida e uma que vai apenas temporariamente aliviar um desconforto que voltará assim que a dopamina da antecipação passar.\n\nHá uma diferença enorme entre comprar um livro de um autor que você ama com intenção de ler — e comprar doze livros num momento de euforia que ficarão na estante sem serem abertos.' },
    ],
    example: 'Gabriela, 33 anos, percebia que apesar de ganhar bem e não ter dívidas, nunca sobrava dinheiro. Quando fez um levantamento honesto, descobriu que gastava em média R$800 por mês em compras online — roupas, itens de decoração, utensílios — a maioria dos quais usava raramente ou nunca.\n\n"Eu comprava quando estava entediada, quando estava ansiosa, quando tinha tido um dia ruim. Era meu jeito de me sentir melhor."\n\nQuando implementou a espera de 72 horas: "Na primeira semana, coloquei sete coisas no carrinho. Depois de 72 horas, queria comprar só duas. Depois de mais 72 horas, queria comprar uma."\n\nEm três meses, suas compras online caíram para menos de um terço. O dinheiro foi para uma viagem que ela tinha adiado há dois anos. "Eu não parei de comprar. Passei a comprar o que realmente queria — não o que a ansiedade do momento queria."',
    flashcards: [
      { front: 'Como o consumo excessivo acontece', back: 'A ESCASSEZ ARTIFICIAL — "Últimas unidades!", "Oferta por tempo limitado!". A urgência criada artificialmente ativa o sistema de ameaça do cérebro e acelera decisões que deveriam ser lentas.', audioTranscript: null },
      { front: 'O custo real do consumo excessivo', back: 'CUSTO FINANCEIRO — Dinheiro gasto em objetos que não usa é dinheiro que não foi para experiências, segurança, sonhos. CUSTO DE ESPAÇO — Cada objeto comprado precisa de um lugar para ficar.', audioTranscript: null },
      { front: 'A diferença entre necessidade, desejo e impulso', back: 'NECESSIDADE — algo que sua vida real, concreta, atual exige. Tem critérios objetivos.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'O que propõe o princípio da \'espera de 72 horas\'?',
      answers: [
        { title: 'Esperar 72 horas antes de finalizar uma compra não essencial, deixando o impulso se dissolver', correct: true, feedback: 'Isso mesmo — a maioria dos impulsos de compra perde força nesse período, revelando o que é desejo genuíno.' },
        { title: 'Devolver qualquer produto em até 72 horas após a compra', correct: false, feedback: 'O princípio é sobre esperar antes de comprar, não sobre devolução após a compra.' },
        { title: 'Comparar preços em pelo menos 3 lojas diferentes', correct: false, feedback: 'Comparação de preços não é o foco do princípio — o objetivo é dar tempo para o impulso passar.' },
        { title: 'Comprar apenas em promoções que durem 72 horas', correct: false, feedback: 'O princípio não tem relação com promoções — é sobre criar uma pausa reflexiva antes da compra.' },
      ],
      },
      {
        question: 'O que diferencia um impulso de um desejo genuíno, segundo a aula?',
        answers: [
          { title: 'O impulso é passageiro e ligado a um gatilho externo ou emocional; o desejo é duradouro e traz valor real', correct: true, feedback: 'Isso mesmo — impulsos passam, mas o objeto comprado por impulso fica.' },
          { title: 'O impulso é sempre mais barato que o desejo', correct: false, feedback: 'Preço não é o critério de diferenciação apresentado na aula.' },
          { title: 'Não existe diferença real entre os dois', correct: false, feedback: 'A aula distingue claramente impulso, desejo e necessidade.' },
          { title: 'O desejo é sempre uma necessidade disfarçada', correct: false, feedback: 'A aula trata necessidade, desejo e impulso como três categorias distintas.' },
        ],
      },
      {
        question: 'O que propõe o princípio um entra, um sai?',
        answers: [
          { title: 'Para cada item novo que entra na casa, um equivalente sai para doação', correct: true, feedback: 'Exato — esse princípio mantém o volume de objetos em equilíbrio.' },
          { title: 'Comprar um item novo a cada vez que um quebra', correct: false, feedback: 'O princípio é sobre equilíbrio de volume, não sobre reposição por quebra.' },
          { title: 'Doar um item por semana, independente de compras', correct: false, feedback: 'O princípio está ligado diretamente às novas entradas de itens, não a uma rotina isolada de doação.' },
          { title: 'Comprar dois itens e descartar um', correct: false, feedback: 'A proporção correta do princípio é de um para um, não dois para um.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'O INVENTÁRIO DE COMPRAS (10 minutos)', description: 'Olhe para os últimos 30 dias de compras. Para cada compra não essencial, classifique: foi necessidade, desejo genuíno ou impulso? Sem julgamento. Apenas observação.' },
        { title: 'IDENTIFIQUE SEUS GATILHOS (10 minutos)', description: 'Olhando para as compras de impulso, pergunte: o que estava acontecendo quando eu comprei? Que emoção estava presente — tédio, ansiedade, tristeza, euforia, estresse?' },
        { title: 'IMPLEMENTE UM PRINCÍPIO ESTA SEMANA', description: 'Escolha um dos cinco princípios e aplique por 7 dias:\n• A regra do espaço\n• A espera de 72 horas\n• A pergunta das cinco vezes\n• Qualidade sobre quantidade\n• Um entra, um sai' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'A última aula desta trilha vai para algo que vai além dos objetos e além dos hábitos de consumo — vai para a identidade. Porque no fundo, a curadoria do que fica na sua casa é também uma curadoria de quem você é. E quando seu espaço reflete quem você realmente é, algo profundo se transforma.',
  },
  'Seu espaço, sua identidade': {
    trilha: 'Seu espaço, sua identidade',
    intro: 'Chegamos à última aula da Trilha Simplificar. E ela é diferente das anteriores. Não vai te dar um método.',
    objectives: ['Compreender: o espaço como extensão da identidade.', 'Reconhecer: o que sua casa diz sobre você agora.', 'Aplicar na prática: curadoria como ato de autoconhecimento.'],
    accordion: [
      { title: 'O espaço como extensão da identidade', description: 'A psicologia ambiental estuda a relação entre as pessoas e os espaços que habitam. Uma das descobertas mais consistentes é que os ambientes que criamos são extensões da nossa identidade — projeções físicas de quem somos, do que valorizamos, de onde estamos na vida.\n\nIsso acontece de duas direções:\n\nDO INTERIOR PARA O EXTERIOR — nossa identidade e nossos valores se manifestam no ambiente que criamos. Uma pessoa que valoriza conexão tende a criar espaços acolhedores para receber. Uma pessoa em transição frequentemente tem um espaço que reflete essa transição.\n\nDO EXTERIOR PARA O INTERIOR — o ambiente que habitamos também nos molda. Acordar todos os dias num espaço que não te representa cria uma dissonância silenciosa — uma sensação vaga de que algo não está certo, mesmo quando você não consegue nomear o quê.\n\nSeu espaço e sua identidade estão em conversa constante. A pergunta é: o que eles estão dizendo um ao outro?' },
      { title: 'O que sua casa diz sobre você agora', description: 'Imagine que uma amiga próxima entra na sua casa pela primeira vez. Sem nenhuma explicação da sua parte, ela olha ao redor. O que ela conclui sobre você?\n\nEssa conclusão reflete quem você realmente é hoje — ou reflete quem você era, quem os outros esperam que você seja, ou quem você ainda está tentando se tornar?\n\nMuitas casas carregam camadas de identidades superpostas:\n\nA IDENTIDADE DE UMA FASE QUE PASSOU — objetos de uma vida que não existe mais\nA IDENTIDADE DOS OUTROS — móveis herdados, decoração que agradou outra pessoa\nA IDENTIDADE ASPIRACIONAL — objetos de um estilo de vida que você imagina ter mas não vive\nA IDENTIDADE REAL — o que genuinamente te representa, te conforta, te inspira agora\n\nUm espaço com curadoria intencional tem principalmente a quarta camada — com espaço para elementos das outras, escolhidos conscientemente.' },
      { title: 'Curadoria como ato de autoconhecimento', description: 'Quando você decide o que fica e o que vai, está fazendo mais do que organizar objetos. Está respondendo, repetidamente, a pergunta: quem sou eu agora?\n\nCada objeto que você mantém é uma afirmação. Cada objeto que você libera é uma despedida — de uma fase, de uma versão de si mesma, de uma expectativa que não é mais sua.\n\nA escritora Fumio Sasaki descreve esse fenômeno com precisão: "Quando paramos de nos definir pelos objetos que possuímos, descobrimos quem somos sem eles."\n\nVocê não é suas roupas. Não é seus móveis. Não é sua coleção. Mas o que você escolhe manter revela muito sobre o que você valoriza — e o que você libera abre espaço para o que ainda está por vir.' },
      { title: 'O que um espaço que te representa parece', description: 'Não existe fórmula universal. Mas existem sinais de que um espaço está alinhado com quem você é:\n\nVocê entra e sente reconhecimento — não apenas familiaridade, mas reconhecimento. "Isso sou eu. Isso é meu lugar."\n\nOs objetos têm história ou função real — não estão ali por acaso, por inércia ou por convenção.\n\nO espaço te convida a ser quem você é — se você é introvertida, tem cantos de silêncio. Se você é criativa, tem espaço para criar. Se você valoriza conexão, tem espaço para receber.\n\nVocê não se envergonha do espaço — não no sentido de que precisa ser perfeito, mas no sentido de que não precisa pedir desculpas por ele.\n\nO espaço evolui com você — não ficou congelado numa versão passada.' },
      { title: 'Criando espaços de significado', description: 'Alguns elementos que transformam um espaço organizado em um espaço com alma:\n\nOBJETOS COM HISTÓRIA PESSOAL — a foto que te faz sorrir toda vez que passa por ela, o objeto trazido de uma viagem que importou, a peça herdada de alguém que você amou.\n\nELEMENTOS NATURAIS — plantas, pedras, madeira, luz natural. A natureza tem efeito comprovado de redução de estresse e aumento de bem-estar em ambientes internos.\n\nOBRAS OU OBJETOS DE BELEZA INTENCIONAL — não decoração genérica comprada porque estava em promoção, mas algo que genuinamente te toca.\n\nESPAÇOS DE PAUSA — um canto com uma poltrona confortável, uma área para tomar café em silêncio, um lugar que convida à leitura ou à contemplação.\n\nCHEIRO INTENCIONAL — o olfato é o sentido mais diretamente ligado à memória e à emoção. Uma vela, um difusor, plantas aromáticas — um cheiro que você associa ao bem-estar transforma instantaneamente a experiência de entrar num espaço.' },
      { title: 'Trilha 3 concluída', description: 'Três trilhas completas — Diagnosticar, Organizar, Simplificar. Você não apenas transformou espaços. Você começou a transformar a relação com o seu ambiente, com seus objetos, com seu consumo e com sua própria identidade.\n\nA Trilha Sustentar vai responder a pergunta que toda mulher que chega até aqui eventualmente faz: como eu mantenho isso? Não sobre criar mais sistemas — mas sobre fazer com que os sistemas que você já criou se mantenham vivos, mesmo nas semanas difíceis, mesmo quando a vida acontece, mesmo quando a motivação some. Porque sustentabilidade não é força de vontade. É design. 🌿' },
    ],
    example: 'Mônica, 44 anos, passou três anos num apartamento que ela descrevia como "funcional mas sem alma". Estava organizado — mas não a representava. Era neutro demais, genérico demais.\n\nQuando fizemos o exercício de identidade, ela percebeu que o apartamento refletia o gosto do ex-marido com quem tinha dividido o espaço por dez anos. Depois da separação, ela havia organizado, mas não havia reconquistado.\n\nEla trocou as cortinas por uma cor que sempre amou e que ele detestava. Colocou plantas — ele era alérgico. Montou um canto de leitura no lugar da televisão que ela nunca assistia. Pendurou fotos de viagens que fez sozinha.\n\n"A casa ficou mais eu. Não ficou mais bonita necessariamente — ficou mais honesta. E honesta é mais bonita do que perfeita."',
    flashcards: [
      { front: 'O espaço como extensão da identidade', back: 'A psicologia ambiental estuda a relação entre as pessoas e os espaços que habitam. Uma das descobertas mais consistentes é que os ambientes que criamos são extensões da nossa identidade — projeções físicas de quem...', audioTranscript: null },
      { front: 'O que sua casa diz sobre você agora', back: 'Imagine que uma amiga próxima entra na sua casa pela primeira vez. Sem nenhuma explicação da sua parte, ela olha ao redor.', audioTranscript: null },
      { front: 'Curadoria como ato de autoconhecimento', back: 'Quando você decide o que fica e o que vai, está fazendo mais do que organizar objetos. Está respondendo, repetidamente, a pergunta: quem sou eu agora?', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Segundo a psicologia ambiental citada na aula, o que os espaços que criamos representam?',
      answers: [
        { title: 'Extensões da nossa identidade', correct: true, feedback: 'Correto — os ambientes que habitamos e organizamos refletem quem somos, não são apenas funcionais.' },
        { title: 'Reflexos da situação financeira, apenas', correct: false, feedback: 'A questão financeira é apenas um fator entre muitos — o ponto central da aula é a identidade, não o poder aquisitivo.' },
        { title: 'Espaços neutros, sem relação com quem somos', correct: false, feedback: 'É exatamente o oposto do que a aula defende: os espaços nunca são neutros, eles comunicam identidade.' },
        { title: 'Cópias de referências vistas em redes sociais', correct: false, feedback: 'A aula incentiva um espaço autêntico e pessoal, não a cópia de referências externas.' },
      ],
      },
      {
        question: 'Segundo a aula, o que caracteriza um espaço com curadoria intencional?',
        answers: [
          { title: 'Tem principalmente objetos que representam quem a pessoa é hoje, com escolha consciente', correct: true, feedback: 'Isso mesmo — a curadoria intencional reflete a identidade atual, não fases passadas ou aspiracionais.' },
          { title: 'Tem o maior número possível de objetos decorativos', correct: false, feedback: 'Quantidade não é o critério — o que importa é a escolha consciente e representativa.' },
          { title: 'Segue exatamente as tendências de decoração do momento', correct: false, feedback: 'A curadoria intencional é pessoal, não baseada em tendências externas.' },
          { title: 'Reproduz fielmente a casa dos pais ou avós', correct: false, feedback: 'A aula fala em identidade própria e atual, não em reproduzir espaços de outras gerações.' },
        ],
      },
      {
        question: 'Qual ideia da escritora Fumio Sasaki é citada na aula?',
        answers: [
          { title: 'Quando paramos de nos definir pelos objetos que possuímos, descobrimos quem somos sem eles', correct: true, feedback: 'Correto — essa é a citação usada para ilustrar a curadoria como autoconhecimento.' },
          { title: 'Compre menos, mas compre sempre o mais caro', correct: false, feedback: 'Essa frase não é citada na aula nem reflete sua mensagem.' },
          { title: 'Uma casa cheia é uma casa feliz', correct: false, feedback: 'Essa frase contraria a mensagem central da aula sobre curadoria intencional.' },
          { title: 'Objetos são a melhor forma de expressar quem somos', correct: false, feedback: 'A citação da aula sugere justamente o contrário: nos descobrirmos além dos objetos.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'O INVENTÁRIO DE IDENTIDADE (15 minutos)', description: 'Responda por escrito:\n• Quais são os três valores mais importantes para mim nesta fase da vida?\n• Como eu quero me sentir quando estou em casa?\n• Que tipo de pessoa estou me tornando — e o que ela precisa no seu ambiente?\n• Existe algo na minha casa que claramente não me representa mais?\n• Existe algo que está faltando que me representaria genuinamente?' },
        { title: 'UMA MUDANÇA DE IDENTIDADE (nos próximos 7 dias)', description: 'Com base nas respostas acima, faça uma mudança pequena e concreta que aproxime seu espaço de quem você é:\n• Colocar uma planta num espaço que estava vazio\n• Pendurar uma foto ou obra que te representa\n• Trocar um objeto genérico por algo com história pessoal\n• Criar um cantinho de pausa que ainda não existe\n• Remover algo que claramente não te pertence mais\n\nPequena. Concreta. Intencional.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Reflita sobre o que essa aula revelou para você. Anote suas percepções e continue na sua travessia.',
  },
  'Por que os sistemas quebram (e como evitar)': {
    trilha: 'Por que os sistemas quebram (e como evitar)',
    intro: 'Você já passou horas organizando um espaço, ficou satisfeita com o resultado — e duas semanas depois estava tudo exatamente como antes? Se isso já aconteceu com você, saiba: não foi falta de disciplina. Não foi preguiça.',
    objectives: ['Compreender: a diferença entre organização e sistema.', 'Reconhecer: os três motivos pelos quais os sistemas quebram.', 'Aplicar na prática: como projetar sistemas que duram.'],
    accordion: [
      { title: 'A diferença entre organização e sistema', description: 'ORGANIZAÇÃO é o estado de um espaço em um momento específico. É o resultado de uma ação — arrumei, organizei, transformei. É o "antes e depois" que você fotografa e que dura enquanto ninguém tocar em nada.\n\nSISTEMA é o conjunto de regras, estruturas e hábitos que fazem a organização se manter ao longo do tempo, com mínimo esforço consciente. É o que acontece depois da foto.\n\nOrganização sem sistema é como encher um balde furado. Você pode encher quantas vezes quiser — o resultado é sempre o mesmo. O sistema é o que tampa o furo.\n\nA diferença na prática:\n• Organizar o closet = estado temporário\n• Sistema de saída permanente + hábito de guardar roupas antes de dormir = estado sustentável\n\n• Limpar a bancada = estado temporário\n• Regra de bancada livre + reset noturno de 5 minutos = estado sustentável\n\nO objetivo desta trilha não é te motivar a organizar mais. É te ajudar a projetar sistemas tão bem que a organização se mantenha quase sozinha.' },
      { title: 'Os três motivos pelos quais os sistemas quebram', description: 'MOTIVO 1 — O SISTEMA É COMPLEXO DEMAIS\nQualquer sistema que exige mais de três passos para ser executado será abandonado nos dias difíceis. E os dias difíceis são inevitáveis.\n\nSistemas sustentáveis precisam ser mais fáceis de seguir do que de ignorar. Quando seguir o sistema é o caminho de menor resistência, ele sobrevive até nos dias mais difíceis.\n\nMOTIVO 2 — O SISTEMA NÃO FOI FEITO PARA A SUA VIDA REAL\nEsse é o erro mais comum de quem busca inspiração em perfis de organização nas redes sociais. Um sistema criado para uma pessoa que mora sozinha, sem filhos, com muito tempo livre, não vai funcionar para uma mãe de três filhos com rotina intensa.\n\nSistemas eficazes são criados para a vida real — com suas limitações reais, seu tempo real, sua energia real, sua família real.\n\nMOTIVO 3 — NÃO HÁ RITUAIS DE RESET\nTodo sistema precisa de momentos planejados de manutenção. Sem um reset periódico, pequenas desordens se acumulam progressivamente até o ponto de ruptura.\n\nO reset não precisa ser grande. Pode ser 10 minutos todas as noites. Pode ser 30 minutos toda semana. O que importa é que existe — planejado, previsível, parte da rotina.' },
      { title: 'Como projetar sistemas que duram', description: 'Um bom sistema tem quatro características:\n\nÓBVIO — qualquer pessoa, sem instrução, consegue entender e seguir. Quando o sistema precisa ser explicado, ele depende de você para funcionar.\n\nFÁCIL — menos passos que a alternativa. Guardar a roupa no lugar certo deve ser mais fácil do que deixar na cadeira. Se não for, a cadeira vai ganhar sempre.\n\nATRAENTE — esteticamente agradável o suficiente para que seguir o sistema seja prazeroso, não apenas funcional.\n\nRESILIENTE — funciona mesmo quando não é seguido perfeitamente. Um bom sistema aguenta dois, três dias de abandono e se recupera rapidamente.' },
      { title: 'O diagnóstico dos sistemas que já existem', description: 'Para cada área da sua casa, pergunte:\n\nCOMO A DESORDEM VOLTA? Observe o padrão. A bancada acumula porque não há um destino claro para o que chega. O closet acumula porque guardar roupa exige mais passos do que deixar na cadeira.\n\nO SISTEMA ATUAL É MAIS FÁCIL QUE A ALTERNATIVA DESORDENADA? Se não for, o sistema vai perder sempre. A fricção precisa estar do lado da desordem, não da organização.\n\nQUEM MAIS PRECISA SEGUIR ESSE SISTEMA? Se depende de comportamentos de outras pessoas, precisa ser especialmente óbvio e fácil. Sistemas que só funcionam quando você está presente não são sistemas — são trabalho seu.' },
    ],
    example: 'Juliana, 39 anos, tinha reorganizado a cozinha três vezes nos últimos dois anos. Todas as vezes, o mesmo resultado: em três semanas, tudo voltava ao estado anterior.\n\nO problema ficou claro: o sistema dela era complexo demais. Categorias elaboradas, etiquetas em tudo, uma sequência específica de onde cada coisa ficava. Era lindo. Era impossível de manter no ritmo da sua vida real.\n\nA solução foi simplificar radicalmente. Três regras, não trinta:\n1. A bancada fica livre — qualquer coisa que não é de uso diário vai para um armário\n2. Cada item tem um armário, não um lugar específico dentro do armário\n3. Reset de 5 minutos antes de dormir — só a bancada\n\nQuatro meses depois, a cozinha ainda estava funcionando. "Não está perfeita como quando eu reorganizei. Mas está funcionando todo dia — e funcionando todo dia é melhor do que perfeito uma vez por mês."',
    flashcards: [
      { front: 'A diferença entre organização e sistema', back: 'ORGANIZAÇÃO é o estado de um espaço em um momento específico. É o resultado de uma ação — arrumei, organizei, transformei.', audioTranscript: null },
      { front: 'Os três motivos pelos quais os sistemas quebram', back: 'MOTIVO 1 — O SISTEMA É COMPLEXO DEMAIS\nQualquer sistema que exige mais de três passos para ser executado será abandonado nos dias difíceis. E os dias difíceis são inevitáveis.', audioTranscript: null },
      { front: 'Como projetar sistemas que duram', back: 'Um bom sistema tem quatro características:\n\nÓBVIO — qualquer pessoa, sem instrução, consegue entender e seguir. Quando o sistema precisa ser explicado, ele depende de você para funcionar.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual é um dos motivos pelos quais os sistemas domésticos quebram, segundo a aula?',
      answers: [
        { title: 'O sistema é complexo demais — exige mais de três passos para ser seguido', correct: true, feedback: 'Isso mesmo — sistemas com muitos passos tendem a ser abandonados, especialmente nos dias mais difíceis.' },
        { title: 'A casa é grande demais', correct: false, feedback: 'O tamanho da casa não é apontado como causa — a complexidade do sistema em si é o fator decisivo.' },
        { title: 'Falta de dinheiro para organizadores', correct: false, feedback: 'Recursos financeiros não são o motivo central discutido — o que importa é o design do sistema.' },
        { title: 'A pessoa não gosta de organizar', correct: false, feedback: 'Não é uma questão de gosto pessoal, mas de como o sistema foi projetado para durar (ou não).' },
      ],
      },
      {
        question: 'Qual é a diferença entre organização e sistema, segundo a aula?',
        answers: [
          { title: 'Organização é um estado temporário; sistema é o que mantém esse estado ao longo do tempo', correct: true, feedback: 'Isso mesmo — organização é a foto; sistema é o que sustenta o resultado depois.' },
          { title: 'Organização e sistema são sinônimos', correct: false, feedback: 'A aula diferencia claramente os dois conceitos.' },
          { title: 'Sistema é mais bonito visualmente que organização', correct: false, feedback: 'A diferença não é estética — é sobre duração e sustentabilidade.' },
          { title: 'Organização dura mais tempo que sistema', correct: false, feedback: 'É o contrário — sem sistema, a organização tende a ser temporária.' },
        ],
      },
      {
        question: 'Quais são as quatro características de um bom sistema, segundo a aula?',
        answers: [
          { title: 'Óbvio, fácil, atraente e resiliente', correct: true, feedback: 'Correto — essas quatro características garantem que o sistema se mantenha mesmo em dias difíceis.' },
          { title: 'Caro, exclusivo, rígido e complexo', correct: false, feedback: 'Essas características são o oposto do que a aula recomenda para um sistema durável.' },
          { title: 'Rápido, silencioso, colorido e moderno', correct: false, feedback: 'Esses não são os critérios apresentados na aula.' },
          { title: 'Flexível, longo, artístico e pessoal', correct: false, feedback: 'A aula define quatro critérios específicos, diferentes desses.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Escolha o sistema que falha', description: 'Escolha o sistema que mais frequentemente quebra na sua casa e descreva por escrito como a desordem volta nesse espaço.' },
        { title: 'Conte os passos', description: 'Quantos passos o sistema atual exige? Se tem mais de três, simplifique até ter dois ou menos.' },
        { title: 'Compare com a alternativa', description: 'O sistema é mais fácil de seguir do que simplesmente deixar as coisas largadas? Se não for, o que precisaria mudar?' },
        { title: 'Defina o reset mínimo', description: 'Qual seria o ritual de reset mínimo para esse espaço — algo que você consiga manter mesmo nos dias difíceis?' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Agora que você entende por que os sistemas quebram e como projetá-los para durar, a próxima aula vai para o momento do dia que tem mais impacto na sustentabilidade de tudo: a manhã. Porque a forma como você começa o dia define, em grande parte, como o restante dele se desdobra — e como a casa se comporta enquanto você vive nela.',
  },
  'A rotina matinal que muda tudo': {
    trilha: 'A rotina matinal que muda tudo',
    intro: 'Existe um princípio que aparece consistentemente na pesquisa sobre hábitos, produtividade e bem-estar: o que você faz nas primeiras horas do dia tem um impacto desproporcional em como o restante dele se desdobra. Não porque existe magia nas manhãs. Mas porque a manhã é o momento em que sua reserva de energia, foco e autocontrole está mais cheia — antes de ser consumida pelas demandas, decisões e imprevistos do dia.',
    objectives: ['Compreender: o mito da rotina matinal perfeita.', 'Reconhecer: a preparação da noite anterior.', 'Aplicar na prática: checklist da manhã leve.'],
    accordion: [
      { title: 'O mito da rotina matinal perfeita', description: 'Você provavelmente já viu: acordar às 4h30, meditação de 30 minutos, exercício de 1 hora, diário, leitura, café da manhã elaborado — tudo antes das 8h. Para a maioria das mulheres com filhos, trabalho e vida real, parece completamente impossível.\n\nE é. Para a maioria das pessoas, na maioria dos dias.\n\nO que a pesquisa sobre hábitos realmente mostra: não é a extensão da rotina matinal que importa — é a consistência e a intenção. Uma rotina de 20 minutos praticada todos os dias supera uma rotina de 2 horas praticada quando a vida permite.' },
      { title: 'A preparação da noite anterior', description: 'A rotina matinal mais eficiente começa 8 a 12 horas antes — na noite anterior. Quando você prepara elementos da manhã na noite anterior, remove decisões e fricções do momento em que sua energia é menor.\n\n🌙 ROUPAS SEPARADAS — a batalha do closet às 7h começa e termina na noite anterior. Separe a roupa completa — incluindo acessórios e sapatos — antes de dormir.\n\n🌙 BOLSA E PERTENCES ORGANIZADOS — chaves no lugar, carteira completa, o que você vai precisar amanhã já pronto.\n\n🌙 COZINHA EM ORDEM — a louça lavada, a bancada limpa. Acordar com a cozinha em ordem é acordar com uma decisão já tomada a seu favor.\n\n🌙 AGENDA DO DIA SEGUINTE REVISADA — saber o que vem pela frente antes de dormir permite que o cérebro processe durante o sono.\n\n🌙 TELA DESLIGADA 30 A 60 MINUTOS ANTES — o sono que antecede a manhã define a qualidade da manhã.' },
      { title: 'Checklist da manhã leve', description: 'Escolha dois ou três itens para começar. Pratique por duas semanas até se tornarem automáticos. Depois adicione o próximo. Nunca adicione um novo hábito antes de o anterior estar consolidado.\n\nPRIMEIROS 5 MINUTOS — antes de qualquer tela\n\n✅ Abrir as janelas ou cortinas — luz natural nos primeiros minutos sinaliza ao cérebro que o dia começou e regula o ritmo circadiano.\n\n✅ Fazer a cama — leva menos de 3 minutos e transforma imediatamente a energia do quarto. Uma pequena vitória completada antes de qualquer outra coisa.\n\n✅ Um copo d\'água antes de qualquer outra coisa — seu corpo passa 6 a 8 horas sem hidratação durante o sono.\n\nPRIMEIROS 15 MINUTOS — o ritmo do dia\n\n✅ Preparar o café ou chá com atenção — não no piloto automático, mas como um ritual de alguns minutos de presença.\n\n✅ Sentar para tomar o café da manhã — sem tela, sem notificação. Mesmo que sejam 10 minutos. Sentar muda a experiência inteira.\n\n✅ Uma micro-tarefa de organização de 5 minutos — uma superfície, uma gaveta, devolver algo ao lugar. Uma micro-vitória que ativa o modo de ação.\n\nA INTENÇÃO DO DIA\n\n✅ Definir uma palavra ou frase para o dia — não uma lista de tarefas. Uma intenção. "Presença." "Calma." "Foco no essencial." "Gentileza comigo mesma."\n\n✅ Identificar a tarefa mais importante do dia — a uma que, se feita, vai fazer o dia valer a pena independente do que mais aconteça.\n\nO QUE EVITAR NAS PRIMEIRAS HORAS\n\n❌ Celular nos primeiros 30 minutos — coloca você imediatamente em modo de resposta às demandas dos outros.\n❌ Notícias logo ao acordar — ativa emoções fortes que podem persistir por horas.\n❌ Discussões ou conversas difíceis — as primeiras horas são para construir seu estado mental.\n❌ Verificar e-mail antes de ter sua primeira hora — e-mail é a agenda dos outros para o seu tempo.' },
      { title: 'A manhã nos dias difíceis', description: 'Haverá dias em que a rotina matinal vai por água abaixo. Nesses dias, não tente manter a rotina completa. Escolha uma coisa — uma única coisa — para ancorar o dia. Pode ser apenas abrir a janela. Pode ser apenas a cama feita.\n\nUma âncora mínima é suficiente para criar um fio de intenção num dia difícil. A rotina matinal não precisa ser perfeita para funcionar. Precisa ser consistente — mesmo que a consistência, nos dias difíceis, signifique apenas um gesto.' },
    ],
    example: 'Vanessa, 36 anos, dizia que "não era pessoa de manhã". Acordava no último minuto, saía sempre com pressa, chegava ao trabalho já exausta e reativa.\n\nO problema estava na véspera: ela nunca preparava nada na noite anterior. Roupa decidida às 7h20. Bolsa procurada às 7h35. Café tomado em pé às 7h45 verificando mensagens.\n\nA mudança foi pequena: durante duas semanas, apenas duas coisas — separar a roupa na noite anterior e não pegar o celular antes de tomar o café.\n\n"A segunda semana eu percebi que estava chegando ao trabalho diferente. Não mais calma — mas mais inteira. Menos no modo de sobrevivência." Quatro meses depois, sua rotina matinal tem 25 minutos. Ela não a chama mais de rotina matinal — chama de "meu tempo antes do dia começar".',
    flashcards: [
      { front: 'O mito da rotina matinal perfeita', back: 'Você provavelmente já viu: acordar às 4h30, meditação de 30 minutos, exercício de 1 hora, diário, leitura, café da manhã elaborado — tudo antes das 8h. Para a maioria das mulheres com filhos, trabalho e vida real,...', audioTranscript: null },
      { front: 'A preparação da noite anterior', back: 'A rotina matinal mais eficiente começa 8 a 12 horas antes — na noite anterior. Quando você prepara elementos da manhã na noite anterior, remove decisões e fricções do momento em que sua energia é menor.', audioTranscript: null },
      { front: 'Checklist da manhã leve', back: 'Escolha dois ou três itens para começar. Pratique por duas semanas até se tornarem automáticos.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Segundo a aula, quando começa de fato uma rotina matinal eficiente?',
      answers: [
        { title: 'Na noite anterior, com a preparação de elementos do dia seguinte', correct: true, feedback: 'Exato — preparar coisas na noite anterior remove decisões e fricções logo na manhã seguinte.' },
        { title: 'Às 4h30 da manhã, com uma rotina extensa', correct: false, feedback: 'A aula desconstrói justamente esse mito da rotina extensa e madrugadora como único caminho eficiente.' },
        { title: 'Apenas depois do café da manhã', correct: false, feedback: 'A preparação eficaz começa antes — na noite anterior — não depois do café.' },
        { title: 'No momento em que a pessoa acorda', correct: false, feedback: 'Esperar até acordar para se preparar gera mais fricção; o ideal é adiantar decisões na noite anterior.' },
      ],
      },
      {
        question: 'Segundo a aula, o que realmente importa numa rotina matinal eficaz?',
        answers: [
          { title: 'Consistência e intenção, não a duração da rotina', correct: true, feedback: 'Isso mesmo — uma rotina curta e consistente supera uma rotina longa e esporádica.' },
          { title: 'Acordar sempre às 4h30 da manhã', correct: false, feedback: 'A aula desconstrói esse mito de horário extremo como requisito.' },
          { title: 'Ter pelo menos 2 horas de rotina todos os dias', correct: false, feedback: 'A duração não é o fator decisivo — consistência importa mais.' },
          { title: 'Seguir exatamente a rotina de influenciadoras digitais', correct: false, feedback: 'A aula recomenda uma rotina pessoal e realista, não copiada de terceiros.' },
        ],
      },
      {
        question: 'O que a aula recomenda para os dias em que a rotina matinal vai por água abaixo?',
        answers: [
          { title: 'Escolher uma única âncora mínima, como abrir a janela ou fazer a cama', correct: true, feedback: 'Exato — uma pequena âncora já é suficiente para manter o fio da intenção.' },
          { title: 'Pular a rotina inteira e recomeçar apenas na semana seguinte', correct: false, feedback: 'A aula sugere manter ao menos um gesto mínimo, não abandonar totalmente.' },
          { title: 'Compensar fazendo o dobro da rotina no dia seguinte', correct: false, feedback: 'Essa compensação não é a recomendação da aula.' },
          { title: 'Sentir culpa e recomeçar do zero', correct: false, feedback: 'A aula evita a lógica de culpa, propondo continuidade com o menor passo possível.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Avalie sua manhã atual', description: 'Como são suas manhãs hoje, honestamente? Descreva em três frases o que geralmente acontece desde que você acorda até começar o dia.' },
        { title: 'Identifique o maior atrito', description: 'Qual é o momento da manhã que mais frequentemente gera estresse ou sensação de derrota? Esse é o seu ponto de partida.' },
        { title: 'Escolha dois elementos', description: 'Do checklist desta aula, escolha dois ou três itens para praticar por duas semanas, até se tornarem automáticos.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Com a manhã ancorada em intenção, a próxima aula vai para a prática semanal que mais impacta a sustentabilidade da organização ao longo do tempo: o reset semanal. Você vai aprender por que 20 a 30 minutos por semana podem substituir horas de reorganização por mês.',
  },
  'O reset semanal': {
    trilha: 'O reset semanal',
    intro: 'Se você pudesse adotar apenas uma prática desta trilha inteira — uma única coisa — que tivesse o maior impacto na sustentabilidade da sua organização ao longo do tempo, seria esta. O reset semanal. A lógica é simples: toda casa acumula pequenas desordens ao longo da semana.',
    objectives: ['Compreender: a matemática da manutenção.', 'Reconhecer: o que o reset semanal não é.', 'Aplicar na prática: a sequência do reset semanal bridge.'],
    accordion: [
      { title: 'A matemática da manutenção', description: 'SEM RESET SEMANAL:\nPequenas desordens acumulam por 2 a 4 semanas → ponto de ruptura → reorganização de 3 a 6 horas → ciclo recomeça\n\nCOM RESET SEMANAL:\n25 minutos por semana → desordens interceptadas antes de acumular → sem ponto de ruptura → sem reorganizações de emergência\n\nEm um mês: 4 resets de 25 minutos = 100 minutos de manutenção, versus uma reorganização de emergência de 4 horas = 240 minutos de trabalho reativo.\n\nO reset semanal não é um gasto de tempo. É um investimento que retorna mais do que consome.' },
      { title: 'O que o reset semanal não é', description: 'Não é faxina — você não vai lavar nada, não vai limpar superfícies, não vai passar aspirador.\nNão é reorganização — você não vai criar novos sistemas nem mudar nada de lugar.\nNão é um evento de fim de semana — 20 a 30 minutos é suficiente quando feito semanalmente.\nNão é opcional quando a semana foi pesada — nas semanas mais intensas, é especialmente importante.' },
      { title: 'A sequência do reset semanal bridge', description: 'ETAPA 1 — O PERCURSO RÁPIDO (5 a 7 minutos)\nPegue uma cesta grande. Percorra toda a casa — todos os cômodos, na mesma ordem sempre — e colete tudo que está fora do lugar. Não guarde ainda. Apenas colete.\n\nRegras do percurso:\n• Não entre em projetos. Se encontrar uma gaveta bagunçada, não abra.\n• Não fique parada mais de 10 segundos em nenhum lugar.\n• Colete apenas o que está visivelmente fora do lugar.\n\nAo terminar, distribua o conteúdo da cesta pelos cômodos corretos.\n\nETAPA 2 — PAPÉIS E PENDÊNCIAS (5 minutos)\nVá até a Caixa de Entrada de documentos. Faça a triagem rápida: o que vai para Ação, o que vai para arquivo, o que é descarte imediato. Não resolva as ações agora — apenas classifique.\n\nETAPA 3 — COZINHA E DESPENSA (5 minutos)\n• Há algo na bancada que não deveria estar ali? Guarde.\n• O que está acabando e precisa entrar na lista de compras? Anote.\n• Há algo na geladeira que precisa ser usado antes de estragar? Note para o planejamento de refeições.\n\nETAPA 4 — QUARTO E CLOSET (3 a 5 minutos)\n• Roupas na cadeira? Guardem no lugar certo ou na cesta de roupas sujas.\n• Superfícies do quarto com itens que não pertencem ali? Devolva.\n• A cesta de saída permanente do closet está cheia? Programe a doação.\n\nETAPA 5 — O PLANEJAMENTO DA SEMANA (5 a 10 minutos)\nCom a casa em ordem ao seu redor, olhe para a semana que vem:\n\n📅 COMPROMISSOS — o que está na agenda? Há algo que precisa de preparação antecipada?\n🍽️ REFEIÇÕES — o que você vai cozinhar essa semana? Planejar agora elimina sete decisões diárias.\n🛒 COMPRAS — baseado na varredura da cozinha e no planejamento de refeições, o que precisa ser comprado?\n⚡ A SEMANA EM PERSPECTIVA — o que é mais importante? O que pode ser delegado? O que pode ser eliminado?' },
      { title: 'Quando fazer o reset semanal', description: 'O momento ideal é aquele que você vai realmente fazer. Algumas opções que funcionam bem:\n\nDOMINGO À TARDE OU NOITE — permite começar a segunda-feira com leveza.\nSEXTA À NOITE — fecha a semana e permite que o fim de semana comece em ordem.\nSÁBADO DE MANHÃ — para quem tem mais energia no início do fim de semana.\n\nO que não funciona: "quando eu tiver tempo" ou "quando a casa precisar". O reset semanal precisa de um dia e horário fixos — tratado como compromisso, não como tarefa opcional.' },
      { title: 'O reset com a família', description: 'Uma estrutura simples que funciona:\n• Você faz o percurso geral e o planejamento\n• Parceiro ou filhos mais velhos fazem a varredura dos seus próprios espaços\n• Crianças menores têm uma tarefa específica e simples\n\nO que importa não é a perfeição da execução de cada um — é que o reset deixa de ser responsabilidade de uma pessoa só.' },
    ],
    example: 'Camila, 42 anos, vivia num ciclo que ela mesma descrevia como "organizo no sábado, desfaço na semana, entro em colapso no sábado seguinte."\n\nQuando implementou o reset semanal — toda segunda-feira às 21h, depois que os filhos dormiam — algo mudou. "A primeira semana foi 40 minutos. A segunda foi 28. Na terceira foi 22. Agora faço em 20 minutos e ainda sobra tempo."\n\n"Eu não parei de ter semanas caóticas. A vida continuou igual. Mas o reset impede que o caos se acumule além de um certo ponto. É como se tivesse um teto para a desordem."',
    flashcards: [
      { front: 'A matemática da manutenção', back: 'SEM RESET SEMANAL:\nPequenas desordens acumulam por 2 a 4 semanas → ponto de ruptura → reorganização de 3 a 6 horas → ciclo recomeça\n\nCOM RESET SEMANAL:\n25 minutos por semana → desordens interceptadas antes de acumular →...', audioTranscript: null },
      { front: 'O que o reset semanal não é', back: 'Não é faxina — você não vai lavar nada, não vai limpar superfícies, não vai passar aspirador. Não é reorganização — você não vai criar novos sistemas nem mudar nada de lugar.', audioTranscript: null },
      { front: 'A sequência do reset semanal bridge', back: 'ETAPA 1 — O PERCURSO RÁPIDO (5 a 7 minutos)\nPegue uma cesta grande. Percorra toda a casa — todos os cômodos, na mesma ordem sempre — e colete tudo que está fora do lugar.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'O que o reset semanal NÃO é, segundo a aula?',
      answers: [
        { title: 'Faxina ou reorganização completa da casa', correct: true, feedback: 'Correto — o reset semanal não envolve limpar superfícies nem criar novos sistemas, apenas devolver objetos ao lugar.' },
        { title: 'Uma rotina de cerca de 25 minutos por semana', correct: false, feedback: 'Essa descrição está certa sobre o que o reset É, não sobre o que ele não é.' },
        { title: 'Uma forma de manutenção contínua da organização', correct: false, feedback: 'Essa também descreve o que o reset é, e não o que ele não é.' },
        { title: 'Uma atividade que pode incluir a família', correct: false, feedback: 'Envolver a família é parte do que o reset pode ser — não é o que ele exclui.' },
      ],
      },
      {
        question: 'Segundo a matemática da manutenção apresentada, o reset semanal economiza quanto tempo por mês, comparado a uma reorganização de emergência?',
        answers: [
          { title: 'Cerca de 140 minutos', correct: true, feedback: 'Isso mesmo — 100 minutos de manutenção mensal evitam 240 minutos de trabalho reativo.' },
          { title: 'O reset semanal não economiza tempo', correct: false, feedback: 'Pelo contrário — a aula mostra uma economia significativa de tempo total.' },
          { title: 'Apenas 5 minutos por mês', correct: false, feedback: 'A economia é bem maior, considerando o tempo evitado de reorganizações de emergência.' },
          { title: 'O dobro do tempo gasto em faxina', correct: false, feedback: 'O reset semanal é apresentado como mais eficiente, não como gerador de mais trabalho.' },
        ],
      },
      {
        question: 'Quais são as etapas do reset semanal Bridge?',
        answers: [
          { title: 'Percurso rápido, papéis, cozinha, quarto e closet, e planejamento da semana', correct: true, feedback: 'Correto — essas cinco etapas compõem a sequência completa do reset semanal.' },
          { title: 'Faxina completa, lavar roupas e cozinhar para a semana', correct: false, feedback: 'O reset semanal não inclui faxina nem cozinhar — é uma manutenção rápida, não uma tarefa doméstica completa.' },
          { title: 'Reorganizar armários e trocar a decoração', correct: false, feedback: 'Isso não faz parte do reset semanal, que é sobre devolver objetos ao lugar, não reorganizar.' },
          { title: 'Apenas revisar a agenda da semana', correct: false, feedback: 'O reset inclui várias etapas físicas, além do planejamento da semana.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'Escolha dia e horário', description: 'Decida agora: qual dia e horário você vai fazer o reset semanal? Coloque na agenda e trate como compromisso fixo.' },
        { title: 'Prepare sua cesta', description: 'Separe uma cesta dedicada ao percurso semanal. Deixe-a num lugar acessível e visível.' },
        { title: 'Faça o primeiro reset esta semana', description: 'Não espere a semana perfeita. Faça o reset esta semana, mesmo que a casa esteja mais bagunçada do que o ideal.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Com o reset semanal como âncora da sua semana, a próxima aula vai tratar de uma das fontes mais frequentes de frustração para mulheres que se organizam: a sensação de estar sozinha nesse trabalho. Você vai aprender como criar sistemas que funcionam para toda a família — e como envolver as pessoas que vivem com você sem transformar isso numa fonte de conflito.',
  },
  'Envolvendo a família na organização': {
    trilha: 'Envolvendo a família na organização',
    intro: 'Você criou sistemas. Organizou espaços. Fez resets.',
    objectives: ['Compreender: por que a família não segue os sistemas.', 'Reconhecer: a carga mental invisível.', 'Aplicar na prática: como criar sistemas que funcionam para todos.'],
    accordion: [
      { title: 'Por que a família não segue os sistemas', description: 'O SISTEMA É INVISÍVEL PARA QUEM NÃO O CRIOU\nQuando você organiza a casa, você cria uma lógica completamente visível para você e completamente invisível para os outros. Seu parceiro não deixa as chaves em lugar aleatório porque não se importa. Deixa porque, para ele, não existe um "lugar certo" — o sistema existe na sua cabeça, não no ambiente.\n\nNINGUÉM FOI ENVOLVIDO NA CRIAÇÃO\nPessoas seguem sistemas que ajudaram a criar. Quando o sistema é imposto — mesmo com boa intenção — a adesão é baixa. Não por resistência ativa, mas por falta de senso de pertencimento ao sistema.\n\nAS EXPECTATIVAS NÃO FORAM COMUNICADAS\n"Eu queria que eles soubessem" é uma das frases mais comuns — e mais custosas — nas dinâmicas domésticas. Expectativas não comunicadas criam ressentimento de um lado e confusão do outro.\n\nOS SISTEMAS EXIGEM MAIS ESFORÇO DO QUE A ALTERNATIVA\nSe guardar algo no lugar certo exige abrir duas portas e reorganizar outras coisas — e a alternativa é simplesmente deixar na bancada — a bancada vai ganhar sempre. Para todos.' },
      { title: 'A carga mental invisível', description: 'Em muitas casas, a organização doméstica ainda é percebida, mesmo que implicitamente, como responsabilidade primária da mulher. O resultado é uma distribuição desigual não apenas do trabalho físico, mas da carga mental — o esforço de perceber o que precisa ser feito, planejar como fazer e gerenciar o processo.\n\nVocê percebe que o papel higiênico está acabando. Você lembra que o filho tem consulta na quinta. Você nota que a geladeira está vazia. Você gerencia a logística invisível da casa enquanto também executa grande parte do trabalho visível.\n\nIsso não é sustentável. E não é justo.' },
      { title: 'Como criar sistemas que funcionam para todos', description: 'ESTRATÉGIA 1 — TORNE O SISTEMA ÓBVIO\nQualquer pessoa, sem instrução prévia, deve conseguir encontrar qualquer objeto e devolvê-lo ao lugar certo.\n\n• Cestos abertos em vez de caixas fechadas — o que é visível é guardado\n• Etiquetas em prateleiras e cestos — especialmente para áreas compartilhadas\n• Menos categorias, mais espaço — sistemas com muitas subdivisões confundem\n• Zonas por tipo de uso, não por objeto\n\nESTRATÉGIA 2 — ENVOLVA NA CRIAÇÃO, NÃO APENAS NA EXECUÇÃO\nAntes de organizar um espaço compartilhado, converse com as pessoas que usam esse espaço. Não "vou organizar a sala, ok?" — mas "onde você acha que faz mais sentido guardar os controles?"\n\nQuando as pessoas participam da decisão de onde as coisas ficam, têm muito mais chance de devolver as coisas para lá.\n\nESTRATÉGIA 3 — DEFINA RESPONSABILIDADES POR ESPAÇO, NÃO POR TAREFA\n"Me ajuda mais em casa" é vago e raramente gera mudança. "Você é responsável pela organização do banheiro" é uma responsabilidade clara.\n\nA responsabilidade inclui perceber e agir — não apenas executar quando lembrado. Crianças a partir de 4 anos podem ter responsabilidades adaptadas à idade.\n\nESTRATÉGIA 4 — CRIE RITUAIS COLETIVOS, NÃO COBRANÇAS INDIVIDUAIS\nA diferença entre "por que você nunca guarda nada?" e "vamos fazer o reset juntos às 20h?" é a diferença entre conflito e sistema.\n\nRituais coletivos funcionam porque tiram a cobrança da equação, criam pertencimento e são previsíveis — todos sabem o que esperar e quando.\n\nESTRATÉGIA 5 — RECONHEÇA, NÃO CRITIQUE\nCrítica constante gera resistência. Reconhecimento gera repetição.\n\nQuando alguém seguir o sistema — mesmo que imperfeitamente — reconheça genuinamente. E quando o sistema não for seguido, corrija o ambiente, não a pessoa. Quando o ambiente não suporta o comportamento, mudar o ambiente é mais eficaz do que mudar a pessoa.' },
      { title: 'A conversa difícil sobre distribuição desigual', description: 'Se você está carregando a maior parte da carga doméstica, essa conversa precisa acontecer. Não como acusação, mas como necessidade genuína.\n\n• Torne o invisível visível — faça uma lista de tudo que você gerencia e executa. Mostre. Não para culpar, mas para criar consciência.\n• Fale em impacto, não em comportamento — não "você nunca ajuda" mas "quando eu carrego tudo sozinha, fico exausta — e isso afeta nossa relação."\n• Proponha soluções, não apenas problemas — venha com ideias concretas de redistribuição.\n• Seja paciente com a curva de aprendizado — pessoas que nunca perceberam certas necessidades não vão perceber da noite para o dia.' },
    ],
    example: 'Patrícia, 40 anos, sentia que a casa estava sempre em ordem quando ela estava presente e em caos quando não estava. Viagens a trabalho eram seguidas de fins de semana de reorganização.\n\nO problema tinha dois componentes: o marido e os filhos não sabiam onde as coisas ficavam — o sistema estava na cabeça dela — e nunca havia sido pedido a eles que se responsabilizassem por espaços específicos.\n\nA solução foi em duas etapas: tornar o sistema visível com etiquetas e cestos abertos, e uma conversa onde cada pessoa escolheu um espaço para ser responsável.\n\n"A primeira semana foi imperfeita. A segunda semana foi melhor. No primeiro mês, eu viajei e voltei para uma casa que não estava perfeita — mas estava funcional. Pela primeira vez."',
    flashcards: [
      { front: 'Por que a família não segue os sistemas', back: 'O SISTEMA É INVISÍVEL PARA QUEM NÃO O CRIOU\nQuando você organiza a casa, você cria uma lógica completamente visível para você e completamente invisível para os outros. Seu parceiro não deixa as chaves em lugar aleatório...', audioTranscript: null },
      { front: 'A carga mental invisível', back: 'Em muitas casas, a organização doméstica ainda é percebida, mesmo que implicitamente, como responsabilidade primária da mulher. O resultado é uma distribuição desigual não apenas do trabalho físico, mas da carga mental...', audioTranscript: null },
      { front: 'Como criar sistemas que funcionam para todos', back: 'ESTRATÉGIA 1 — TORNE O SISTEMA ÓBVIO\nQualquer pessoa, sem instrução prévia, deve conseguir encontrar qualquer objeto e devolvê-lo ao lugar certo. • Cestos abertos em vez de caixas fechadas — o que é visível é guardado\n•...', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Por que a família muitas vezes não segue os sistemas criados por uma pessoa?',
      answers: [
        { title: 'Porque a lógica do sistema é visível para quem o criou, mas invisível para os outros', correct: true, feedback: 'Isso mesmo — um sistema que faz sentido para quem o pensou pode parecer arbitrário para quem não participou da criação.' },
        { title: 'Porque a família não se importa com organização', correct: false, feedback: 'A aula não atribui o problema à falta de interesse, mas à falta de clareza e participação no sistema.' },
        { title: 'Porque os sistemas são sempre complicados demais para qualquer pessoa', correct: false, feedback: 'O problema não é a complexidade em si, mas o fato de o sistema não ter sido construído de forma compartilhada e óbvia.' },
        { title: 'Porque a casa é grande demais para todos seguirem', correct: false, feedback: 'O tamanho da casa não é citado como causa — o que importa é a visibilidade e clareza do sistema para todos.' },
      ],
      },
      {
        question: 'Qual estratégia a aula sugere para aumentar a adesão da família aos sistemas?',
        answers: [
          { title: 'Envolver as pessoas na criação do sistema, não apenas na execução', correct: true, feedback: 'Isso mesmo — quem participa da criação tem muito mais chance de seguir o sistema.' },
          { title: 'Impor regras rígidas sem consultar ninguém', correct: false, feedback: 'Isso tende a gerar baixa adesão, segundo a aula.' },
          { title: 'Cobrar apenas quando algo estiver fora do lugar', correct: false, feedback: 'A cobrança isolada não é a estratégia recomendada — rituais coletivos funcionam melhor.' },
          { title: 'Fazer tudo sozinha para evitar conflitos', correct: false, feedback: 'Isso sobrecarrega uma pessoa só e não resolve o problema da adesão da família.' },
        ],
      },
      {
        question: 'O que a aula recomenda ao invés do pedido genérico me ajuda mais em casa?',
        answers: [
          { title: 'Definir responsabilidades claras por espaço, como você é responsável pela organização do banheiro', correct: true, feedback: 'Exato — responsabilidades específicas por espaço geram mais clareza e comprometimento.' },
          { title: 'Não pedir ajuda para não incomodar', correct: false, feedback: 'A aula incentiva comunicação clara, não evitar o assunto.' },
          { title: 'Repetir o pedido genérico com mais frequência', correct: false, feedback: 'Pedidos vagos tendem a não gerar mudança real, segundo a aula.' },
          { title: 'Esperar que a pessoa perceba sozinha, sem conversar', correct: false, feedback: 'A aula recomenda comunicação explícita das expectativas, não expectativa silenciosa.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'O MAPA DE RESPONSABILIDADES ATUAL', description: 'Faça uma lista honesta de todas as responsabilidades domésticas — físicas e de gestão mental — e quem as executa atualmente. Inclua as invisíveis: lembrar, perceber, planejar, gerenciar.' },
        { title: 'A REDISTRIBUIÇÃO POSSÍVEL', description: 'Olhando para a lista, identifique:\n• O que poderia ser redistribuído para o parceiro?\n• O que poderia ser responsabilidade dos filhos, adaptado à idade?\n• O que poderia ser simplificado ou eliminado?' },
        { title: 'UMA CONVERSA E UM SISTEMA', description: 'Esta semana, tenha uma conversa sobre distribuição com as pessoas que vivem com você — não como cobrança, mas como proposta. E implemente um sistema óbvio em um espaço compartilhado.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'A última aula desta trilha vai para algo que sabota silenciosamente mais travessias do que qualquer falta de sistema: o perfeccionismo. Você vai entender por que a busca pela casa perfeita é, paradoxalmente, o maior inimigo da casa organizada — e como cultivar a mentalidade do progresso que sustenta a transformação a longo prazo.',
  },
  'Celebrando o progresso, não a perfeição': {
    trilha: 'Celebrando o progresso, não a perfeição',
    intro: 'Chegamos à última aula da Trilha Sustentar. E ela vai tratar do inimigo mais silencioso e mais poderoso de toda transformação sustentável. Não é a falta de tempo.',
    objectives: ['Compreender: como o perfeccionismo funciona na organização.', 'Reconhecer: de onde vem o perfeccionismo doméstico.', 'Aplicar na prática: a alternativa: a mentalidade do progresso.'],
    accordion: [
      { title: 'Como o perfeccionismo funciona na organização', description: 'TUDO OU NADA\nO perfeccionismo opera em binário: ou a casa está perfeita, ou está uma bagunça. Não existe meio-termo aceitável. Uma mulher perfeccionista não começa a organizar a gaveta porque sabe que não vai ter tempo de terminar perfeitamente. Então não começa nada. A gaveta fica bagunçada por meses enquanto ela espera o momento perfeito que nunca chega.\n\nA COMPARAÇÃO EXTERNA\nAs redes sociais amplificaram o perfeccionismo doméstico de forma sem precedentes. O que não mostram: as horas de preparação para a foto, o ângulo que esconde a bagunça fora do quadro, e que aquelas casas provavelmente não se parecem com aquelas fotos na segunda-feira de manhã com duas crianças e uma semana pesada.\n\nA META MOVENTE\nO perfeccionismo tem uma característica cruel: a meta nunca está completamente atingida. Você organiza o quarto — mas o banheiro ainda está bagunçado. Não existe um ponto de chegada onde o perfeccionista declara vitória. Existe apenas uma lista infinita de imperfeições restantes.\n\nA PARALISIA PELA ANÁLISE\nAntes de começar, o perfeccionismo questiona tudo: qual é o sistema certo? Qual é a melhor cesta? Qual é o momento ideal? A análise infinita se torna uma forma sofisticada de procrastinação.' },
      { title: 'De onde vem o perfeccionismo doméstico', description: 'A pesquisadora Brené Brown oferece uma perspectiva transformadora: "O perfeccionismo não é sobre ter padrões elevados. É sobre tentar ganhar aprovação."\n\nNo contexto doméstico feminino, existe uma carga cultural histórica que associa a qualidade da casa à competência da mulher que a habita. Uma casa bagunçada não é apenas uma casa bagunçada — é, num imaginário coletivo ainda muito vivo, um reflexo de quem você é como mulher, mãe, esposa.\n\nReconhecer isso não resolve automaticamente o perfeccionismo. Mas cria compaixão com si mesma — e compaixão é o solo onde a mudança real cresce.' },
      { title: 'A alternativa: a mentalidade do progresso', description: 'A mentalidade do progresso não é desleixo, não é baixar o padrão. É uma mudança fundamental na métrica de avaliação.\n\nO perfeccionismo avalia em relação ao ideal — e sempre encontra deficiência.\nA mentalidade do progresso avalia em relação ao ponto de partida — e quase sempre encontra avanço.\n\nA mesma casa, avaliada pelos dois critérios:\n\nCOM PERFECCIONISMO: "A sala ainda está bagunçada, o banheiro precisa de atenção, o closet não está como deveria. Não consegui fazer o suficiente."\n\nCOM MENTALIDADE DO PROGRESSO: "Essa semana fiz o reset duas vezes, organizei a gaveta da cozinha que estava há meses bagunçada, e dormi melhor do que no mês passado. Estou avançando."\n\nA realidade é a mesma. A experiência é completamente diferente.' },
      { title: 'O padrão do "bom o suficiente"', description: 'Uma casa "boa o suficiente" todos os dias supera, em qualidade de vida real, uma casa perfeita uma vez por mês.\n\nUm reset semanal "bom o suficiente" — 15 minutos em vez de 30, parcialmente feito em vez de completamente — supera o reset perfeito que não acontece porque as condições nunca estão ideais.\n\n"Bom o suficiente" não é resignação. É sabedoria prática sobre como as coisas realmente funcionam no longo prazo.' },
      { title: 'Como cultivar a mentalidade do progresso', description: 'PRÁTICA 1 — DOCUMENTE A JORNADA, NÃO APENAS O DESTINO\nTire fotos ao longo do processo — não apenas do resultado final. Essas fotos têm um poder que a memória não tem: elas são objetivas. Quando você está num dia difícil e sente que não avançou nada, as fotos mostram o que realmente mudou.\n\nPRÁTICA 2 — CELEBRE O QUE FUNCIONOU, NÃO APENAS O QUE FALTOU\nNo final de cada semana, responda uma única pergunta: o que funcionou esta semana? Treinar o cérebro a perceber o que avança — não apenas o que falta — é uma habilidade que se desenvolve com prática deliberada.\n\nPRÁTICA 3 — REDEFINA O QUE "ORGANIZADA" SIGNIFICA PARA VOCÊ\nNão para os outros. Para você — na sua casa, com sua família, no seu ritmo de vida. Escreva uma definição. Essa definição se torna seu critério de avaliação — não a foto do perfil de organização que você salvou no Instagram.\n\nPRÁTICA 4 — PRATIQUE A INTERRUPÇÃO DO PENSAMENTO PERFECCIONISTA\nQuando perceber o pensamento perfeccionista se instalando, questione-o: é verdade? Comparado ao quê? Ao ideal ou ao ponto de partida? Muitas vezes, o pensamento perfeccionista não sobrevive ao questionamento honesto.\n\nPRÁTICA 5 — NOS DIAS DE COLAPSO, VOLTE AO MÍNIMO\nHaverá semanas em que tudo vai por água abaixo. A mentalidade perfeccionista diz: "fracassei, preciso recomeçar do zero." A mentalidade do progresso diz: "qual é o menor passo que posso dar agora para voltar ao caminho?"\n\nO menor passo. Não o passo perfeito — o menor passo possível.' },
      { title: 'Trilha 4 concluída', description: 'Você aprendeu a criar sistemas que duram, a estabelecer rituais que sustentam, a envolver as pessoas ao seu redor e a cultivar a mentalidade que faz a transformação durar além da motivação inicial.\n\nHá uma última trilha. E ela é diferente de todas as outras.\n\nA Trilha Florescer não vai te ensinar a organizar nada. Vai te convidar a habitar com plenitude o espaço que você transformou. A criar rituais de bem-estar que nutrem em vez de apenas funcionar. A descobrir o que significa, para você, viver com leveza, intenção e presença plena.\n\nPorque uma casa organizada é o meio — nunca o fim. O fim é a vida que acontece dentro dela. 🌸' },
    ],
    example: 'Mariana, 38 anos, tinha reorganizado a casa três vezes em dois anos — e nas três vezes, desistido dentro de um mês. O padrão era sempre o mesmo: começava com energia máxima, tinha uma semana difícil, concluía que havia "falhado" e abandonava tudo.\n\nA causa estava clara: o critério de sucesso era a perfeição. A mudança foi redefinir o critério. Em vez de "mantive a casa perfeita esta semana?", a pergunta passou a ser "o que funcionou esta semana?"\n\nNa primeira semana da mudança, ela teve uma semana difícil. Mas quando respondeu à nova pergunta, encontrou três coisas que funcionaram.\n\n"Eu teria chamado essa semana de fracasso antes. Agora eu vejo que foi uma semana imperfeita com progresso real. São coisas muito diferentes."\n\nDez meses depois, ainda está no caminho. Não com uma casa perfeita — com uma casa em progresso constante.',
    flashcards: [
      { front: 'Como o perfeccionismo funciona na organização', back: 'TUDO OU NADA\nO perfeccionismo opera em binário: ou a casa está perfeita, ou está uma bagunça. Não existe meio-termo aceitável.', audioTranscript: null },
      { front: 'De onde vem o perfeccionismo doméstico', back: 'A pesquisadora Brené Brown oferece uma perspectiva transformadora: "O perfeccionismo não é sobre ter padrões elevados. É sobre tentar ganhar aprovação."\n\nNo contexto doméstico feminino, existe uma carga cultural...', audioTranscript: null },
      { front: 'A alternativa: a mentalidade do progresso', back: 'A mentalidade do progresso não é desleixo, não é baixar o padrão. É uma mudança fundamental na métrica de avaliação.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Segundo Brené Brown, citada na aula, sobre o que realmente é o perfeccionismo?',
      answers: [
        { title: 'Tentar ganhar aprovação, não ter padrões elevados', correct: true, feedback: 'Exato — essa é a perspectiva citada: o perfeccionismo está mais ligado à busca por aprovação do que a padrões de qualidade em si.' },
        { title: 'Um sinal de organização avançada', correct: false, feedback: 'Pelo contrário — a aula trata o perfeccionismo como uma armadilha, não como uma virtude organizacional.' },
        { title: 'Uma característica genética imutável', correct: false, feedback: 'A aula não trata o perfeccionismo como algo genético, mas como um padrão que pode ser transformado.' },
        { title: 'O oposto do progresso', correct: false, feedback: 'Embora estejam em tensão, a citação de Brené Brown especificamente liga o perfeccionismo à busca por aprovação.' },
      ],
      },
      {
        question: 'Qual é a diferença central entre a mentalidade perfeccionista e a mentalidade do progresso?',
        answers: [
          { title: 'O perfeccionismo avalia em relação ao ideal; o progresso avalia em relação ao ponto de partida', correct: true, feedback: 'Isso mesmo — essa mudança de métrica muda completamente a forma como você enxerga suas conquistas.' },
          { title: 'Não existe diferença real entre as duas mentalidades', correct: false, feedback: 'A aula descreve uma diferença clara e importante entre elas.' },
          { title: 'A mentalidade do progresso exige padrões mais baixos de limpeza', correct: false, feedback: 'Não se trata de baixar padrões, mas de mudar o critério de avaliação.' },
          { title: 'O perfeccionismo é sempre mais rápido de alcançar resultados', correct: false, feedback: 'Pelo contrário — o perfeccionismo frequentemente gera paralisia e atraso.' },
        ],
      },
      {
        question: 'O que a aula recomenda fazer nas semanas de colapso total?',
        answers: [
          { title: 'Voltar ao mínimo e dar o menor passo possível, em vez de recomeçar do zero', correct: true, feedback: 'Correto — a mentalidade do progresso valoriza o menor passo possível, não o recomeço total.' },
          { title: 'Abandonar completamente os sistemas até sentir motivação novamente', correct: false, feedback: 'A aula recomenda continuar com passos mínimos, não abandonar tudo.' },
          { title: 'Recomeçar do zero, desconsiderando o que já foi feito', correct: false, feedback: 'Essa é a lógica perfeccionista que a aula busca evitar.' },
          { title: 'Contratar ajuda profissional imediatamente', correct: false, feedback: 'Essa não é a recomendação central da aula para semanas difíceis.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'O INVENTÁRIO DO PERFECCIONISMO (10 minutos)', description: '• Em que momentos o perfeccionismo aparece mais na sua relação com a casa?\n• Que pensamentos específicos ele produz?\n• Quais ações ele impede ou sabota?' },
        { title: 'REDEFINA SEU CRITÉRIO (10 minutos)', description: 'Escreva sua definição pessoal de "casa organizada o suficiente" — baseada na sua realidade, não no ideal. Específica o suficiente para ser avaliável, flexível o suficiente para sobreviver às semanas difíceis.' },
        { title: 'A PERGUNTA SEMANAL', description: 'A partir desta semana, toda vez que fizer o reset semanal, responda por escrito: "O que funcionou esta semana?" Guarde as respostas — elas vão contar a história do seu progresso ao longo do tempo.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Reflita sobre o que essa aula revelou para você. Anote suas percepções e continue na sua travessia.',
  },
  'Quando a casa vira lar': {
    trilha: 'Quando a casa vira lar',
    intro: 'Você chegou à última trilha. Pense por um momento no caminho percorrido. Você diagnosticou.',
    objectives: ['Compreender: a diferença entre casa e lar.', 'Reconhecer: o que cria a atmosfera de um lar.', 'Aplicar na prática: a presença como ingrediente principal.'],
    accordion: [
      { title: 'A diferença entre casa e lar', description: 'Uma casa organizada é funcional. Os objetos têm lugar, os sistemas funcionam, a manutenção acontece.\n\nMas um lar vai além. Um lar tem uma presença. Uma atmosfera. Uma sensação que você reconhece antes mesmo de nomear. É o tipo de lugar que, quando você entra, algo no seu corpo relaxa — não porque está arrumado, mas porque está vivo de uma forma específica que é sua.\n\nEssa diferença não é sobre dinheiro. Não é sobre tamanho. Não é sobre estilo de decoração. É sobre intenção habitada.' },
      { title: 'O que cria a atmosfera de um lar', description: 'CHEIRO\nO olfato é o sentido mais diretamente ligado à memória e à emoção. Quando você associa um cheiro específico ao bem-estar — uma vela, ervas frescas, o café pela manhã, lavanda no quarto — esse cheiro passa a sinalizar ao seu sistema nervoso: aqui é um lugar seguro. Aqui você pode relaxar.\n\nLUZ\nLuz natural é insubstituível. Ela regula o ritmo circadiano, melhora o humor e reduz sintomas de ansiedade. À noite, luz quente e indireta cria acolhimento. Abajures, luminárias de chão, velas, fitas de LED quente — cada um adiciona uma camada de warmth que transforma a experiência noturna do espaço.\n\nTEXTURA\nCobertores macios, almofadas com textura, tapetes que convidam os pés descalços, madeira natural. A textura cria conforto físico — e conforto físico cria segurança emocional. Materiais macios ativam o sistema nervoso parassimpático — o modo de descanso que é o oposto do estado de alerta.\n\nMEMÓRIA AFETIVA\nFotos de pessoas amadas. Objetos trazidos de viagens que importaram. Heranças familiares que carregam história. Não em excesso — mas com presença intencional. Esses elementos criam densidade afetiva — a qualidade de um espaço que está vivo de significado pessoal.\n\nSILÊNCIO INTENCIONAL\nUm lar tem momentos de silêncio que não precisam ser preenchidos. Na cultura contemporânea, preenchemos cada momento com conteúdo. Mas o silêncio permite que o ambiente respire, que os pensamentos se organizem, que o descanso seja real.' },
      { title: 'A presença como ingrediente principal', description: 'Um lar não é um cenário. É um espaço vivo porque pessoas vivas o habitam com atenção.\n\nREFEIÇÕES À MESA, COM ATENÇÃO — não perfeitas, não elaboradas. Mas com presença. Sem tela, com as pessoas que você ama ou com você mesma, conscientemente.\n\nRITUAIS PEQUENOS E CONSISTENTES — o café da manhã preparado com cuidado. A vela acesa no jantar de sábado. O chá antes de dormir. Não por obrigação, mas porque marcam o tempo de uma forma que o torna mais real, mais habitado.\n\nMOMENTOS DE PARADA — sentar no sofá sem fazer nada. Olhar pela janela. Ficar parada na cozinha depois de terminar o café, apenas sentindo o espaço ao redor. Esses são os momentos em que você realmente habita o espaço, em vez de apenas transitar por ele.\n\nCUIDADO COM O ESPAÇO COMO CUIDADO CONSIGO MESMA — quando você coloca flores num vaso porque te alegra vê-las, quando você acende a vela não porque tem visita mas porque você merece — você está habitando o espaço com presença e com amor próprio.' },
    ],
    example: 'Teresa, 52 anos, tinha uma casa linda — bem decorada, bem organizada. Mas quando perguntei como ela se sentia em casa, ela ficou em silêncio antes de responder: "Honestamente? Como se estivesse de visita."\n\nA casa era funcional e bonita, mas não era dela. Era a casa que ela havia montado para impressionar — não a casa onde ela se sentia livre para ser quem era.\n\nO processo de transformar aquela casa em lar não envolveu reorganizar nada. Envolveu adicionar: a poltrona de leitura que ela sempre quis mas achava "desnecessária". As plantas que o marido anterior não gostava. O ritual do chá de ervas todas as noites, com a televisão desligada.\n\n"Demorei 52 anos para entender o que significa uma casa ser minha. Não é sobre decoração. É sobre permissão. Me dar permissão para habitar o espaço do jeito que me nutre — não do jeito que impressiona."',
    flashcards: [
      { front: 'A diferença entre casa e lar', back: 'Uma casa organizada é funcional. Os objetos têm lugar, os sistemas funcionam, a manutenção acontece.', audioTranscript: null },
      { front: 'O que cria a atmosfera de um lar', back: 'CHEIRO\nO olfato é o sentido mais diretamente ligado à memória e à emoção. Quando você associa um cheiro específico ao bem-estar — uma vela, ervas frescas, o café pela manhã, lavanda no quarto — esse cheiro passa a...', audioTranscript: null },
      { front: 'A presença como ingrediente principal', back: 'Um lar não é um cenário. É um espaço vivo porque pessoas vivas o habitam com atenção.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual a principal diferença entre \'casa\' e \'lar\', segundo a aula?',
      answers: [
        { title: 'O lar tem uma presença e atmosfera que vão além da funcionalidade da casa organizada', correct: true, feedback: 'Correto — uma casa organizada é funcional, mas o lar acrescenta uma camada de presença e sensação que a organização sozinha não cria.' },
        { title: 'Casa é onde se mora, lar é onde se trabalha', correct: false, feedback: 'Essa não é a distinção feita na aula — ambas se referem ao mesmo espaço físico, com camadas diferentes de significado.' },
        { title: 'Lar é sempre maior do que casa', correct: false, feedback: 'O tamanho não tem relação com a diferença discutida — é uma questão de atmosfera e presença, não de metragem.' },
        { title: 'Não existe diferença real entre os dois termos', correct: false, feedback: 'A aula é justamente sobre como existe uma diferença importante de significado entre os dois conceitos.' },
      ],
      },
      {
        question: 'Segundo a aula, por que o cheiro tem papel importante na atmosfera de um lar?',
        answers: [
          { title: 'Porque é o sentido mais diretamente ligado à memória e à emoção', correct: true, feedback: 'Isso mesmo — um cheiro associado ao bem-estar sinaliza segurança ao sistema nervoso.' },
          { title: 'Porque disfarça a bagunça do ambiente', correct: false, feedback: 'A função do cheiro discutida na aula é emocional e sensorial, não disfarçar desorganização.' },
          { title: 'Porque é o único sentido relacionado ao conforto', correct: false, feedback: 'A aula também trata de luz e textura, entre outros — o cheiro é um deles, não o único.' },
          { title: 'Porque atrai visitas para a casa', correct: false, feedback: 'O foco da aula é o bem-estar de quem habita o espaço, não atrair visitantes.' },
        ],
      },
      {
        question: 'O que caracteriza um ritual pequeno e consistente que cria a sensação de lar?',
        answers: [
          { title: 'Ações como acender uma vela no jantar de sábado ou tomar um chá antes de dormir, feitas com atenção', correct: true, feedback: 'Correto — pequenos rituais recorrentes tornam o tempo mais real e habitado.' },
          { title: 'Grandes reformas na decoração da casa', correct: false, feedback: 'A aula fala de pequenos gestos recorrentes, não de reformas.' },
          { title: 'Compras mensais de itens decorativos novos', correct: false, feedback: 'Rituais não são sobre consumo, e sim sobre presença e atenção.' },
          { title: 'Eventos únicos que acontecem uma vez por ano', correct: false, feedback: 'Rituais são recorrentes e frequentes, não eventos anuais isolados.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'O INVENTÁRIO SENSORIAL (15 minutos)', description: 'Percorra sua casa com atenção aos cinco sentidos. Para cada cômodo, anote:\n• Cheiro: há algum cheiro intencional?\n• Luz: a iluminação convida ao descanso — ou é apenas funcional?\n• Textura: há elementos que convidam ao toque e ao conforto físico?\n• Memória afetiva: há objetos com presença afetiva real?\n• Som: há momentos de silêncio intencional?' },
        { title: 'UM ELEMENTO DE LAR (esta semana)', description: 'Escolha um único elemento sensorial para adicionar ou cultivar esta semana. Uma vela. Uma planta. Uma foto emoldurada. Um ritual de silêncio de 10 minutos antes de dormir.\n\nPequeno. Intencional. Seu.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Agora que você começou a entender o que transforma uma casa em lar, a próxima aula vai para uma prática concreta que sustenta essa transformação no cotidiano: os rituais de bem-estar. Você vai aprender a diferença entre rotina e ritual — e como criar momentos intencionais que transformam o ordinário em algo significativo, sem precisar de tempo extra ou recursos que você não tem.',
  },
  'Criando rituais de bem-estar em casa': {
    trilha: 'Criando rituais de bem-estar em casa',
    intro: 'Rituais não exigem mais tempo. Exigem mais atenção. E atenção é algo que você pode escolher dar — mesmo numa vida ocupada, mesmo numa semana difícil, mesmo num dia que não está indo bem.',
    objectives: ['Compreender: a diferença entre rotina e ritual.', 'Reconhecer: por que rituais importam.', 'Aplicar na prática: checklist para criar seus rituais.'],
    accordion: [
      { title: 'A diferença entre rotina e ritual', description: 'Uma ROTINA é uma sequência de ações executadas com regularidade, muitas vezes no piloto automático.\n\nUm RITUAL é a mesma sequência de ações — mas carregada de intenção e presença.\n\nO café da manhã pode ser uma rotina: rápido, em pé, verificando o celular. Ou pode ser um ritual: preparado com cuidado, saboreado devagar, vivido como os primeiros minutos do dia antes que qualquer demanda chegue.\n\nO tempo gasto é o mesmo. A experiência é completamente diferente.' },
      { title: 'Por que rituais importam', description: 'Uma pesquisa da Universidade de Harvard mostrou que pessoas que praticam rituais antes de tarefas desafiadoras apresentam menos ansiedade e melhor desempenho. O poder não está no conteúdo do ritual, mas no ato de criar intenção consciente.\n\nNo contexto doméstico, rituais marcam o tempo. Numa vida onde os dias às vezes se confundem, rituais criam pontos de ancoragem — momentos que você reconhece como seus, que dizem ao seu cérebro: agora é este momento. Esteja aqui.\n\n— OS QUATRO TIPOS DE RITUAIS DE BEM-ESTAR —\n\nRITUAIS DE TRANSIÇÃO\nMarcam a passagem de um estado para outro — do trabalho para o descanso, da semana para o fim de semana.\n\nSem rituais de transição, os estados se misturam. Você está fisicamente em casa mas mentalmente ainda no trabalho.\n\nExemplos:\n• Trocar de roupa ao chegar em casa — sinal físico de que um modo terminou\n• Um copo d\'água ou chá ao chegar — sentar por 5 minutos antes de entrar nas demandas\n• Um banho de desaceleração no fim do dia — não funcional, mas intencional\n\nRITUAIS DE CONEXÃO\nCriam momentos de presença com as pessoas que você ama — ou com você mesma.\n\nExemplos:\n• Jantar à mesa, sem telas, algumas vezes por semana\n• Uma conversa de 10 minutos com os filhos antes de dormir\n• Um café da manhã consigo mesma no fim de semana — sem pressa, sem tela\n\nRITUAIS DE RESTAURO\nExistem exclusivamente para você — para recarregar, para desacelerar.\n\nExemplos:\n• Um banho longo e quente como ritual — não uma limpeza funcional, mas um momento de cuidado\n• 20 minutos de leitura antes de dormir — para prazer puro\n• Um momento de cuidado com o corpo — como ato de atenção consigo mesma\n\nRITUAIS DE GRATIDÃO E PRESENÇA\nCriam o hábito de notar o que está bem — contrariando o viés de negatividade natural do cérebro.\n\nExemplos:\n• Três coisas pelas quais você é grata hoje — escritas, não apenas pensadas — antes de dormir\n• Um momento de contemplação depois do reset semanal — perceber o que está bem\n• Um minuto de presença intencional num espaço da casa que você ama' },
      { title: 'Checklist para criar seus rituais', description: '✅ ESCOLHA UM PONTO DE ANCORAGEM\nTodo ritual precisa de um gatilho claro. "Quando chego em casa, troco de roupa antes de qualquer outra coisa." O gatilho torna o ritual automático com o tempo.\n\n✅ COMECE RIDICULAMENTE PEQUENO\nUm ritual de 2 minutos tem muito mais chance de acontecer do que um de 30. Comece menor do que parece necessário. A consistência supera a perfeição.\n\n✅ REMOVA A FRICÇÃO\nO que você precisa para o ritual deve estar acessível e visível. A vela no lugar onde vai acendê-la. O livro no criado-mudo. Quanto mais fácil é iniciar, mais o ritual acontece.\n\n✅ PROTEJA O TEMPO\nRituais precisam de proteção ativa. Comunique às pessoas que vivem com você. Coloque na agenda. Trate como compromisso.\n\n✅ NÃO QUEBRE A CORRENTE\nUm calendário simples onde você marca os dias que o ritual aconteceu é surpreendentemente eficaz para criar momentum.\n\n✅ ADAPTE, NÃO ABANDONE\nNas semanas difíceis, reduza o ritual à sua versão mínima — mas não o abandone. A versão mínima mantém o hábito vivo até as condições melhorarem.' },
      { title: 'Sugestões por momento do dia', description: 'MANHÃ\n• Abrir as janelas e ficar em silêncio por 2 minutos antes de qualquer tela\n• Preparar o café ou chá com atenção — sentir o calor, o cheiro, o momento\n• Fazer a cama com cuidado — como presente para a versão de você que vai se deitar à noite\n• Escrever uma intenção para o dia — uma palavra, uma frase\n\nTARDE / TRANSIÇÃO\n• O ritual de troca de roupa ao chegar em casa\n• 5 minutos de silêncio antes de entrar nas demandas da tarde\n• Uma xícara de chá como fronteira entre trabalho e casa\n\nNOITE\n• Acender uma vela no jantar — mesmo que seja só você\n• O reset noturno da cozinha como ritual de fechamento do dia\n• 20 minutos de leitura antes de dormir\n• Três gratidões escritas antes de apagar a luz\n• Preparar o dia seguinte como gesto de cuidado com a versão de você de amanhã\n\nFIM DE SEMANA\n• Um café da manhã longo e sem pressa — o ritual que marca que é fim de semana\n• O reset semanal como ritual de renovação, não de obrigação\n• Um momento intencional de não fazer nada — sentar, olhar, respirar' },
    ],
    example: 'Isadora, 34 anos, dizia que nunca tinha tempo para si mesma. Cada minuto do dia era dedicado a alguém ou a alguma tarefa. Ela havia se tornado invisível na própria vida.\n\nA mudança foi simples: depois que os filhos dormiam, acender uma vela, fazer um chá de camomila, e passar 20 minutos lendo um livro escolhido por prazer.\n\n"Parece ridiculamente pequeno. Mas esses 20 minutos mudaram algo em mim. É como se eu existisse de novo. Como se tivesse um pedaço do dia que é meu — não de ninguém mais."\n\nQuatro meses depois: "Eu não me tornei uma pessoa diferente. Mas aprendi a me tratar como se eu importasse. E isso mudou tudo."',
    flashcards: [
      { front: 'A diferença entre rotina e ritual', back: 'Uma ROTINA é uma sequência de ações executadas com regularidade, muitas vezes no piloto automático. Um RITUAL é a mesma sequência de ações — mas carregada de intenção e presença.', audioTranscript: null },
      { front: 'Por que rituais importam', back: 'Uma pesquisa da Universidade de Harvard mostrou que pessoas que praticam rituais antes de tarefas desafiadoras apresentam menos ansiedade e melhor desempenho. O poder não está no conteúdo do ritual, mas no ato de criar...', audioTranscript: null },
      { front: 'Checklist para criar seus rituais', back: '✅ ESCOLHA UM PONTO DE ANCORAGEM\nTodo ritual precisa de um gatilho claro. "Quando chego em casa, troco de roupa antes de qualquer outra coisa." O gatilho torna o ritual automático com o tempo.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Qual a diferença entre rotina e ritual, segundo a aula?',
      answers: [
        { title: 'O ritual é a mesma sequência de ações, mas carregada de intenção e presença', correct: true, feedback: 'Isso mesmo — a diferença não está nas ações em si, mas na qualidade de atenção com que são feitas.' },
        { title: 'Ritual é sempre mais longo que rotina', correct: false, feedback: 'Duração não é o que diferencia os dois — o que muda é a intenção e presença, não o tempo gasto.' },
        { title: 'Rotina envolve religião, ritual não', correct: false, feedback: 'Essa distinção não tem relação com o sentido usado na aula, que é sobre intenção no dia a dia, não religião.' },
        { title: 'Não há diferença real entre os dois', correct: false, feedback: 'Há sim uma diferença central discutida na aula: a presença de intenção transforma rotina em ritual.' },
      ],
      },
      {
        question: 'Quais são os quatro tipos de rituais de bem-estar apresentados na aula?',
        answers: [
          { title: 'Transição, conexão, restauro e gratidão', correct: true, feedback: 'Isso mesmo — esses quatro tipos cobrem diferentes necessidades do dia a dia.' },
          { title: 'Manhã, tarde, noite e madrugada', correct: false, feedback: 'A classificação da aula é por função (transição, conexão etc.), não por horário do dia.' },
          { title: 'Físico, financeiro, social e espiritual', correct: false, feedback: 'Essa não é a classificação usada na aula para os tipos de rituais.' },
          { title: 'Individual, familiar, profissional e comunitário', correct: false, feedback: 'A aula não categoriza os rituais dessa forma.' },
        ],
      },
      {
        question: 'Segundo o checklist da aula, por que começar com um ritual muito pequeno?',
        answers: [
          { title: 'Porque um ritual de 2 minutos tem muito mais chance de acontecer do que um de 30', correct: true, feedback: 'Exato — a consistência de um ritual pequeno supera a ambição de um ritual grande que não se sustenta.' },
          { title: 'Porque rituais pequenos não exigem nenhum esforço', correct: false, feedback: 'A aula não afirma isso — o ponto é sobre viabilidade e consistência, não ausência de esforço.' },
          { title: 'Porque rituais grandes são proibidos', correct: false, feedback: 'Não há proibição — a aula recomenda começar pequeno por uma questão prática de sustentabilidade.' },
          { title: 'Porque rituais pequenos duram mais tempo por dia', correct: false, feedback: 'O objetivo é o oposto: rituais menores, mais fáceis de manter com consistência.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'MAPEIE OS VAZIOS (10 minutos)', description: 'Olhe para a sua semana típica. Onde existem momentos que poderiam ser rituais — mas que atualmente são preenchidos com distração ou piloto automático?' },
        { title: 'ESCOLHA UM RITUAL PARA COMEÇAR', description: 'Dos quatro tipos, qual ressoa mais com o que você precisa agora? Defina:\n• O momento exato em que vai acontecer\n• O gatilho que vai dispará-lo\n• A duração mínima (comece com 5 minutos ou menos)\n• O que você precisa preparar para remover a fricção' },
        { title: 'PRATIQUE POR 21 DIAS', description: 'Não 21 dias perfeitos — 21 dias onde você tenta. Marque cada dia que aconteceu. Observe o que muda.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Com os rituais como prática concreta de bem-estar, a próxima aula vai aprofundar a relação entre o ambiente físico e a saúde mental. Você vai entender como sua casa pode ser ativamente projetada para apoiar seu bem-estar psicológico — e quais mudanças simples têm o maior impacto nessa direção.',
  },
  'A casa como espaço de saúde mental': {
    trilha: 'A casa como espaço de saúde mental',
    intro: 'Passamos em média 90% do nosso tempo em ambientes fechados. Isso significa que a qualidade desses ambientes não é um detalhe periférico da nossa saúde — é um fator central. Sua casa não é apenas o lugar onde você dorme e guarda seus objetos.',
    objectives: ['Compreender: o que a ciência diz sobre ambientes e saúde mental.', 'Reconhecer: projetando sua casa para a saúde mental.', 'Aplicar o aprendizado da aula na sua rotina.'],
    accordion: [
      { title: 'O que a ciência diz sobre ambientes e saúde mental', description: 'LUZ NATURAL E RITMO CIRCADIANO\nO ritmo circadiano é o relógio biológico interno que regula praticamente todas as funções do corpo — sono, humor, metabolismo, sistema imunológico. E ele é sincronizado, primariamente, pela luz.\n\nAbrir as cortinas logo ao acordar não é apenas um gesto estético. É um ato de saúde. Posicionar sua área de trabalho perto de uma janela não é um luxo. É ergonomia mental.\n\nPLANTAS E BEM-ESTAR\nEstudos mostram que a presença de plantas em ambientes fechados reduz os níveis de cortisol, melhora a concentração em até 15%, reduz a pressão arterial em situações de estresse e aumenta a sensação subjetiva de bem-estar.\n\nEssa teoria está ligada ao que o biólogo E.O. Wilson chamou de biofilia — a tendência inata dos seres humanos de buscar conexão com outras formas de vida. Nosso sistema nervoso ainda responde a essa sinalização. Uma única planta faz diferença mensurável.\n\nORDEM VISUAL E CARGA COGNITIVA\nPesquisadores da Universidade de Princeton mostraram que ambientes desordenados reduzem significativamente a capacidade de foco e aumentam os níveis de estresse — mesmo quando a pessoa não está conscientemente prestando atenção à desordem.\n\nAmbientes com superfícies limpas reduzem a carga cognitiva, promovem relaxamento e facilitam o estado de flow — o foco profundo que acontece quando a mente não é interrompida por estímulos desnecessários.\n\nESPAÇOS DE TRANSIÇÃO E REGULAÇÃO EMOCIONAL\nO sistema nervoso não faz transições abruptas bem. Passar diretamente do estresse do trânsito para as demandas da casa mantém o sistema nervoso em estado de alerta por muito mais tempo.\n\nCriar espaços de transição — mesmo simbólicos — tem impacto real na regulação emocional. Um banco na entrada onde você senta por 2 minutos ao chegar. Um canto sem celular. Um ritual de desaceleração.\n\nCONTROLE DE SOM E SISTEMA NERVOSO\nPesquisas da OMS mostram que exposição crônica a ruído está associada a aumento de cortisol, pressão arterial elevada, qualidade de sono reduzida e maior irritabilidade.\n\nO controle de som no ambiente doméstico é uma forma de higiene do sistema nervoso. Televisão desligada durante as refeições. Notificações silenciadas em horários definidos. Momentos de silêncio deliberado ao longo do dia.' },
      { title: 'Projetando sua casa para a saúde mental', description: 'MAXIMIZE A LUZ NATURAL\n• Abra as cortinas logo ao acordar e mantenha-as abertas durante o dia\n• Posicione sua área de trabalho perto de uma janela\n• Mantenha janelas limpas — vidros sujos reduzem significativamente a entrada de luz\n• Se a luz natural é limitada, considere lâmpadas de espectro completo\n\nTRAGA O VERDE PARA DENTRO\n• Comece com uma planta resistente — pothos, zamioculca, cacto, suculenta\n• Posicione onde você passa mais tempo — área de trabalho, sala, quarto\n• Ervas na janela da cozinha combinam o benefício visual com o sensorial\n\nREDUZA O RUÍDO VISUAL\n• Superfícies limpas, objetos com endereço, curadoria intencional\n• Reduza o número de itens sobre superfícies horizontais\n• Crie zonas visuais de descanso — onde o olho pode pousar sem ser capturado por estimulação\n\nCRIE ESPAÇOS DE TRANSIÇÃO\n• Um lugar específico para sentar ao chegar em casa — mesmo que por 2 minutos\n• Uma área sem tecnologia — onde você vai para descansar de verdade\n• Um ritual físico de transição entre o modo trabalho e o modo casa\n\nGERENCIE O SOM INTENCIONALMENTE\n• Estabeleça pelo menos 30 minutos por dia sem nenhum som de fundo\n• Desligue a televisão durante as refeições\n• Crie playlists intencionais para diferentes momentos\n• Silencie notificações em horários definidos\n\nCUIDE DA TEMPERATURA E DO AR\n• Ventile os ambientes diariamente — abra janelas por pelo menos 10 minutos\n• Umidificadores em climas secos melhoram o bem-estar e a qualidade do sono' },
    ],
    example: 'Beatriz, 45 anos, havia sido diagnosticada com transtorno de ansiedade generalizada dois anos antes. Estava em terapia e tomava medicação — mas sentia que havia algo no seu dia a dia que continuava alimentando a ansiedade.\n\nQuando analisamos seu ambiente: ela trabalhava num quarto sem janela. Tinha cortinas blackout no quarto. A televisão ficava ligada como ruído de fundo por praticamente todo o dia. Não havia nenhuma planta na casa.\n\nAs mudanças foram graduais: transferiu sua área de trabalho para a sala, próxima à janela. Trocou as blackout por persianas reguláveis. Desligou a televisão durante o dia. Colocou três plantas na sala e uma no banheiro.\n\nTrês meses depois, sua psiquiatra comentou: "O ambiente é parte do tratamento. Você mudou o contexto em que seu sistema nervoso opera todo dia."',
    flashcards: [
      { front: 'O que a ciência diz sobre ambientes e saúde mental', back: 'LUZ NATURAL E RITMO CIRCADIANO\nO ritmo circadiano é o relógio biológico interno que regula praticamente todas as funções do corpo — sono, humor, metabolismo, sistema imunológico. E ele é sincronizado, primariamente,...', audioTranscript: null },
      { front: 'Projetando sua casa para a saúde mental', back: 'MAXIMIZE A LUZ NATURAL\n• Abra as cortinas logo ao acordar e mantenha-as abertas durante o dia\n• Posicione sua área de trabalho perto de uma janela\n• Mantenha janelas limpas — vidros sujos reduzem significativamente a...', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Por que a luz natural é importante para a saúde mental, segundo a aula?',
      answers: [
        { title: 'Porque regula o ritmo circadiano, que afeta sono, humor e outras funções do corpo', correct: true, feedback: 'Exato — o ritmo circadiano é o relógio biológico interno, e a exposição à luz natural ajuda a regulá-lo adequadamente.' },
        { title: 'Porque deixa a casa visualmente mais bonita', correct: false, feedback: 'O benefício discutido vai além da estética — é sobre o efeito biológico da luz no corpo e na mente.' },
        { title: 'Porque reduz a conta de energia elétrica', correct: false, feedback: 'A economia de energia não é o foco da aula — o ponto central é o efeito da luz natural na saúde mental.' },
        { title: 'Porque evita o crescimento de mofo', correct: false, feedback: 'Esse não é o argumento da aula, que trata da luz natural sob a ótica do ritmo circadiano e bem-estar.' },
      ],
      },
      {
        question: 'Segundo estudos citados na aula, qual é o efeito das plantas em ambientes fechados?',
        answers: [
          { title: 'Reduzem cortisol, melhoram a concentração e aumentam o bem-estar', correct: true, feedback: 'Isso mesmo — mesmo uma única planta já mostra efeitos mensuráveis, segundo os estudos citados.' },
          { title: 'Não têm nenhum efeito comprovado sobre o bem-estar', correct: false, feedback: 'A aula cita estudos que mostram efeitos reais e mensuráveis das plantas.' },
          { title: 'Aumentam o estresse por exigirem cuidado', correct: false, feedback: 'Os estudos citados mostram o oposto: redução de estresse e cortisol.' },
          { title: 'Servem apenas como elemento decorativo, sem outros efeitos', correct: false, feedback: 'A aula destaca efeitos biológicos e emocionais reais, além do valor estético.' },
        ],
      },
      {
        question: 'O que a pesquisa da Universidade de Princeton mostrou sobre ambientes desordenados, segundo a aula?',
        answers: [
          { title: 'Reduzem a capacidade de foco e aumentam os níveis de estresse, mesmo sem atenção consciente', correct: true, feedback: 'Correto — o efeito acontece mesmo quando a pessoa não percebe conscientemente a desordem.' },
          { title: 'Não têm nenhum efeito mensurável no cérebro', correct: false, feedback: 'A pesquisa citada mostra justamente o contrário: um efeito real e mensurável.' },
          { title: 'Melhoram a criatividade em todos os casos', correct: false, feedback: 'A pesquisa citada aponta para efeitos negativos no foco e no estresse, não para ganhos de criatividade.' },
          { title: 'Afetam apenas pessoas com TDAH', correct: false, feedback: 'O estudo citado na aula não limita o efeito a esse grupo específico.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'O DIAGNÓSTICO AMBIENTAL DE SAÚDE MENTAL (15 minutos)', description: 'Percorra sua casa e avalie cada fator:\n\n🌞 LUZ NATURAL: quanta luz entra nos espaços onde você passa mais tempo? O que está bloqueando?\n🌿 VERDE: há plantas nos seus espaços? Onde faria mais sentido adicionar?\n👁️ ORDEM VISUAL: qual espaço tem o maior ruído visual? O que poderia ser reduzido?\n🔇 SOM: qual é o nível de ruído de fundo típico? Há horários de silêncio intencional?\n🚪 TRANSIÇÃO: existe algum espaço ou ritual que cria transição entre estados diferentes?' },
        { title: 'UMA MUDANÇA DE SAÚDE MENTAL ESTA SEMANA', description: 'Escolha o fator com maior impacto potencial e faça uma mudança concreta e acessível. Não uma reforma — um gesto intencional.' },
        { title: 'OBSERVE E REGISTRE', description: 'Durante duas semanas, observe como você se sente nos espaços após a mudança. Anote qualquer diferença — no humor, na qualidade do sono, na ansiedade, na concentração.' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Chegamos à última aula de toda a travessia. E ela não vai te ensinar nada novo sobre organização ou sistemas. Vai te convidar a olhar para o caminho percorrido — e para quem você se tornou ao percorrê-lo. Porque a maior transformação desta travessia nunca foi sobre a casa. Foi sobre você.',
  },
  'Sua nova história começa aqui': {
    trilha: 'Sua nova história começa aqui',
    intro: 'Você chegou até aqui. Pare por um momento e deixe isso pousar. Não passe para a próxima coisa ainda.',
    objectives: ['Compreender: o que realmente aconteceu nesta travessia.', 'Reconhecer: os dias difíceis que ainda vão vir.', 'Aplicar na prática: o que florescimento realmente significa.'],
    accordion: [
      { title: 'O que realmente aconteceu nesta travessia', description: 'VOCÊ APRENDEU A SE VER NO SEU AMBIENTE\nAntes, a casa era um cenário onde a vida acontecia. Agora você sabe que existe uma conversa constante entre o espaço que você habita e quem você é. Você aprendeu a ler essa conversa — e a participar dela de forma intencional.\n\nVOCÊ TOMOU DECISÕES QUE A MAIORIA DAS PESSOAS ADIA INDEFINIDAMENTE\nOrganizar, simplificar, descartar, criar sistemas, cultivar rituais — cada uma dessas práticas exige algo escasso e valioso: atenção deliberada à própria vida. A maioria das pessoas passa anos sabendo que algo precisa mudar e não agindo. Você agiu.\n\nVOCÊ CONSTRUIU UMA RELAÇÃO DIFERENTE COM O SEU ESPAÇO\nNão de perfeição — de cuidado. Perfeição é uma meta impossível que gera apenas frustração. Cuidado é uma prática diária que gera crescimento real.\n\nVOCÊ SE COLOCOU NA EQUAÇÃO\nAo decidir que seu ambiente merece cuidado, você estava dizendo que você merece cuidado. Que sua vida cotidiana importa. Que o jeito que você se sente em casa, todos os dias, é algo que vale a pena investir.\n\nNuma cultura que frequentemente pede às mulheres que coloquem todos os outros primeiro, isso é um ato de coragem silenciosa.' },
      { title: 'Os dias difíceis que ainda vão vir', description: 'Haverá semanas em que a casa vai entrar em colapso. Em que os sistemas vão falhar. Em que você vai olhar ao redor e sentir que voltou à estaca zero.\n\nVocê não terá voltado à estaca zero. Mas vai parecer assim.\n\nNesses momentos, o que faz a diferença não é a perfeição dos sistemas — é a consciência que você desenvolveu. A capacidade de nomear o que está acontecendo. De saber o caminho de volta. De começar pelo menor passo possível.\n\nEssa consciência não desaparece nas semanas difíceis. É o que você realmente construiu aqui — e ela é sua, permanentemente.' },
      { title: 'O que florescimento realmente significa', description: 'Florescimento não é um estado permanente de leveza e perfeição. Não é uma casa sempre em ordem, uma rotina sempre cumprida, uma mente sempre clara.\n\nFlorescimento é a capacidade de retornar. De cair e saber o caminho de volta. De ter uma semana de colapso e não interpretar isso como fracasso definitivo. De construir e reconstruir com menos drama, mais compaixão e mais habilidade a cada ciclo.\n\nFlorescimento é uma prática, não um destino. E você já está praticando.' },
      { title: 'O que continuar significa', description: 'A travessia não termina aqui. Ela evolui.\n\nAPROFUNDAR O QUE VOCÊ CRIOU — os sistemas existem, mas podem ser refinados. Os hábitos estão nascendo, mas podem se fortalecer. A próxima fase é de consolidação — não de grandes transformações, mas de pequenos refinamentos contínuos.\n\nEXPANDIR PARA NOVAS ÁREAS — talvez você tenha começado pela casa e percebido que os mesmos princípios se aplicam a outras áreas. A organização do tempo. A simplificação dos compromissos. O consumo consciente nas finanças. Os princípios são os mesmos — os contextos se multiplicam.\n\nCOMPARTILHAR A TRAVESSIA — existe algo poderoso que acontece quando você compartilha o que aprendeu. Não para impressionar — mas porque quando você articula sua transformação para outra pessoa, ela se aprofunda em você.\n\nCONTINUAR SE TORNANDO — no fundo, tudo que fizemos aqui foi criar condições para que você possa se tornar mais plenamente quem você é.' },
      { title: 'Uma última reflexão sobre leveza', description: 'A leveza que o Bridge propõe não é a leveza de não ter problemas. Não é uma casa sempre perfeita. Não é uma vida sem peso.\n\nÉ a leveza de saber o caminho de volta quando você se perde. De ter um ambiente que te restaura em vez de te drenar. De não carregar o peso invisível de decisões adiadas, espaços que te pesam, sistemas que falharam antes mesmo de começar.\n\nÉ a leveza de uma mulher que sabe que seu espaço, sua rotina e sua vida cotidiana merecem cuidado — e que age a partir dessa convicção, um dia de cada vez, imperfeita e consistentemente.\n\nEssa leveza você já tem. Pode não sentir o tempo todo. Mas está lá — construída aula por aula, escolha por escolha, ao longo de toda esta travessia.' },
      { title: 'O exercício final', description: 'PARTE 1 — A CARTA PARA O FUTURO\nEscreva uma carta para a versão de você daqui a um ano. Descreva onde você está agora, o que mudou, o que ainda está em construção, e o que você deseja para ela — não em termos de casa perfeita, mas de vida vivida. Guarde a carta. Leia daqui a um ano.\n\nPARTE 2 — A CELEBRAÇÃO\nEscolha uma forma de celebrar a conclusão desta travessia:\n• Um jantar especial preparado com cuidado na sua casa transformada\n• Uma tarde dedicada a um ritual que você criou e ama\n• Um presente para si mesma — pequeno e intencional\n• Uma foto da sua casa agora, ao lado do antes, com uma frase que capture o que mudou\n\nCelebre. Você percorreu algo real.\n\nPARTE 3 — A INTENÇÃO QUE CONTINUA\nReleia a intenção de travessia que você escreveu na Trilha Diagnosticar. Depois escreva uma nova — não para substituir, mas para expandir. Quem você está se tornando agora? O que você quer para a próxima fase?' },
      { title: 'Para você, que chegou até aqui', description: 'Você percorreu esta travessia num momento da sua vida. Com tudo que estava acontecendo ao redor — as demandas, os imprevistos, os dias sem energia. E ainda assim, você continuou.\n\nIsso diz algo sobre quem você é.\n\nNão sobre perfeição. Sobre comprometimento com a própria vida. Sobre a convicção de que você merece um ambiente que te nutra, uma rotina que te apoie, uma vida com mais intenção e mais leveza.\n\nEssa convicção é o que chegou aqui com você. E é o que vai continuar — muito além desta última aula, muito além desta trilha, muito além desta travessia.\n\nContinue sua travessia. 🌿' },
    ],
    example: null,
    flashcards: [
      { front: 'O que realmente aconteceu nesta travessia', back: 'VOCÊ APRENDEU A SE VER NO SEU AMBIENTE\nAntes, a casa era um cenário onde a vida acontecia. Agora você sabe que existe uma conversa constante entre o espaço que você habita e quem você é.', audioTranscript: null },
      { front: 'Os dias difíceis que ainda vão vir', back: 'Haverá semanas em que a casa vai entrar em colapso. Em que os sistemas vão falhar.', audioTranscript: null },
      { front: 'O que florescimento realmente significa', back: 'Florescimento não é um estado permanente de leveza e perfeição. Não é uma casa sempre em ordem, uma rotina sempre cumprida, uma mente sempre clara.', audioTranscript: null },
    ],
    quiz: [
      {
      question: 'Segundo a aula, o que significa realmente \'florescimento\' ao final da travessia?',
      answers: [
        { title: 'A capacidade de voltar ao equilíbrio quando a vida desorganiza as coisas, não um estado permanente de perfeição', correct: true, feedback: 'Correto — florescimento não é ausência de dias difíceis, é saber como retornar ao equilíbrio quando eles acontecem.' },
        { title: 'Uma casa sempre impecável, sem exceções', correct: false, feedback: 'A aula é clara: florescimento não é sobre uma casa sempre perfeita, mas sobre a capacidade de se reorganizar.' },
        { title: 'O fim de qualquer dificuldade futura', correct: false, feedback: 'A aula reconhece que dias difíceis ainda vão acontecer — florescimento não é a ausência deles.' },
        { title: 'Uma rotina que nunca muda', correct: false, feedback: 'Florescimento envolve evolução contínua, não uma rotina fixa e estática.' },
      ],
      },
      {
        question: 'Segundo a aula, o que significa realmente a leveza que o Bridge propõe?',
        answers: [
          { title: 'Saber o caminho de volta quando a vida desorganiza as coisas, não a ausência de problemas', correct: true, feedback: 'Isso mesmo — a leveza não é uma vida sem peso, é a capacidade de retornar ao equilíbrio.' },
          { title: 'Nunca mais ter uma semana difícil', correct: false, feedback: 'A aula reconhece que dias difíceis vão continuar acontecendo — leveza não é isso.' },
          { title: 'Ter uma casa sempre perfeita, sem exceções', correct: false, feedback: 'Perfeição não é o conceito de leveza apresentado na aula.' },
          { title: 'Delegar toda a organização da casa para outra pessoa', correct: false, feedback: 'Leveza não está relacionada a delegar tudo, mas à relação interna com o processo.' },
        ],
      },
      {
        question: 'Quais são as formas de continuar sugeridas ao final da travessia?',
        answers: [
          { title: 'Aprofundar o que foi criado, expandir para novas áreas e compartilhar a jornada', correct: true, feedback: 'Exato — a travessia evolui nessas direções após a conclusão das cinco trilhas.' },
          { title: 'Parar completamente, já que a jornada está encerrada', correct: false, feedback: 'A aula é clara: a travessia não termina, ela evolui.' },
          { title: 'Repetir exatamente as mesmas 24 aulas sem mudanças', correct: false, feedback: 'A ideia não é repetir o conteúdo, mas aprofundar e expandir os princípios aprendidos.' },
          { title: 'Focar exclusivamente na casa, sem aplicar os princípios a outras áreas da vida', correct: false, feedback: 'A aula sugere expandir os princípios para outras áreas, como tempo, compromissos e finanças.' },
        ],
      },
    ],
    exercise: {
      intro: { title: 'Exercício Prático', description: 'Coloque em prática o que aprendeu nesta aula com o passo a passo abaixo.' },
      steps: [
        { title: 'A carta para o futuro', description: 'Escreva uma carta para a versão de você daqui a um ano. Descreva onde você está agora, o que mudou, e o que deseja para ela.' },
        { title: 'A celebração', description: 'Escolha uma forma de celebrar a conclusão desta travessia: um jantar especial, um ritual que você ama, ou uma foto do antes e depois da sua casa.' },
        { title: 'A intenção que continua', description: 'Releia a intenção que você escreveu na Trilha Diagnosticar. Depois escreva uma nova — não para substituir, mas para expandir: quem você está se tornando agora?' },
      ],
      summary: { title: 'Exercício concluído!', description: 'Cada pequena ação consolida o que você aprendeu nesta aula. Perceber e agir é o caminho da travessia.' },
    },
    closing: 'Reflita sobre o que essa aula revelou para você. Anote suas percepções e continue na sua travessia.',
  },
};

// ═══════════════════════════════════════
// TAB TRILHAS — LAYOUT NETFLIX
// ═══════════════════════════════════════

function ProgressBar({ value, color, height=3 }) {
  return (
    <View style={{ backgroundColor:C.sand2, borderRadius:99, height, overflow:'hidden' }}>
      <View style={{ width:`${value}%`, height:'100%', backgroundColor:color, borderRadius:99 }} />
    </View>
  );
}

const LESSON_IMAGES = {
  'o_peso_invisivel_da_desordem': 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80',
  'mapeando_sua_realidade_atual': 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400&q=80',
  'identificando_seus_pontos_de_sobrecarga': 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&q=80',
  'criando_sua_intencao_de_travessia': 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=400&q=80',
  'por_onde_comecar_sem_se_sentir_perdida': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
  'o_quarto_que_restaura': 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=400&q=80',
  'a_cozinha_funcional': 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80',
  'closet_sem_culpa': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
  'sala_e_areas_comuns': 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80',
  'documentos_e_papeis_fim_do_caos': 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=400&q=80',
  'a_arte_de_soltar_o_que_nao_serve_mais': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80',
  'metodo_bridge_de_descarte_intencional': 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400&q=80',
  'simplificando_a_rotina_mental': 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400&q=80',
  'consumo_consciente_comprando_menos_e_melhor': 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80',
  'seu_espaco_sua_identidade': 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400&q=80',
  'por_que_os_sistemas_quebram_e_como_evitar': 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400&q=80',
  'a_rotina_matinal_que_muda_tudo': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
  'o_reset_semanal': 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=400&q=80',
  'envolvendo_a_familia_na_organizacao': 'https://images.unsplash.com/photo-1609220136736-443140cffec6?w=400&q=80',
  'celebrando_o_progresso_nao_a_perfeicao': 'https://images.unsplash.com/photo-1531685250784-7569952593d2?w=400&q=80',
  'quando_a_casa_vira_lar': 'https://images.unsplash.com/photo-1586105251261-72a756497a11?w=400&q=80',
  'criando_rituais_de_bemestar_em_casa': 'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=400&q=80',
  'a_casa_como_espaco_de_saude_mental': 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400&q=80',
  'sua_nova_historia_comeca_aqui': 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=400&q=80',
};

function getLessonImage(title) {
  const slug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,'').trim().replace(/\s+/g,'_');
  return `https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/images/${slug}.jpg?t=4`;
}

function getLessonPDF(title) {
  const slug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,'').trim().replace(/\s+/g,'_');
  return `https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/pdfs/${slug}.pdf?download=${slug}.pdf&t=1`;
}

function LessonCard({ lesson, trail, isDone, onPress }) {
  const cardBg = isDone ? C.sand2 : '#fff';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ width:180, backgroundColor: cardBg, borderWidth:1, borderColor: isDone?C.navy+'44':C.sand2, borderRadius:14, padding:14, marginRight:10 }}>
      <View style={{ width:'100%', aspectRatio:1, borderRadius:8, marginBottom:10, overflow:'hidden' }}>
        <Image source={{ uri: getLessonImage(lesson.title) }} style={{ width:'100%', height:'100%' }} resizeMode="cover" />
      </View>
      <Text style={{ color:C.navy, fontSize:12, fontWeight:'700', marginBottom:6, lineHeight:17 }} numberOfLines={2}>{lesson.title}</Text>
      <Text style={{ color:C.muted, fontSize:10, marginBottom:4 }}>{lesson.type==='checklist'?'✅ Checklist':'📖 Artigo'}</Text>
      {isDone && <Text style={{ color:C.navy, fontSize:9, fontWeight:'700', letterSpacing:1, marginTop:6 }}>CONCLUÍDA</Text>}
    </TouchableOpacity>
  );
}

function TrailRow({ trail, done, onLessonPress }) {
  const lessons = TRAIL_CONTENT[trail.id] || [];
  const watched = lessons.filter(l => done[`${trail.id}-${l.title}`]).length;
  const pct = lessons.length ? Math.round((watched/lessons.length)*100) : 0;
  return (
    <View style={{ marginBottom:36 }}>
      <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, marginBottom:12, gap:8 }}>
        <View style={{ width:3, height:20, borderRadius:2, backgroundColor:C.navy, flexShrink:0 }} />
        <Text style={{ fontSize:16, flexShrink:0 }}>{trail.icon}</Text>
        <View style={{ flex:1, minWidth:0 }}>
          <Text style={{ color:C.navy, fontSize:15, fontWeight:'800' }} numberOfLines={1}>{trail.name}</Text>
          <Text style={{ color:C.muted, fontSize:10 }} numberOfLines={1}>{trail.desc}</Text>
        </View>
        <View style={{ alignItems:'flex-end', flexShrink:0, minWidth:60 }}>
          <Text style={{ color:C.navy, fontSize:12, fontWeight:'700' }}>{pct}%</Text>
          <View style={{ width:60, marginTop:4 }}><ProgressBar value={pct} color={C.navy} /></View>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:20 }}>
        {lessons.map((lesson,i) => {
          const key = `${trail.id}-${lesson.title}`;
          return <LessonCard key={i} lesson={lesson} trail={trail} isDone={!!done[key]} onPress={()=>onLessonPress(trail,lesson,key)} />;
        })}
      </ScrollView>
    </View>
  );
}

function getTrailImage(trail) {
  const slug = trail.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,'').trim().replace(/\s+/g,'_');
  return `https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/images/trilha_${slug}.jpg?t=2`;
}

function HeroBanner({ trail, done, onPress }) {
  const tc = TRAIL_COLORS[trail.id]||TRAIL_COLORS['1'];
  const [imgFailed, setImgFailed] = useState(false);
  const lessons = TRAIL_CONTENT[trail.id]||[];
  const watched = lessons.filter(l=>done[`${trail.id}-${l.title}`]).length;
  const pct = lessons.length?Math.round((watched/lessons.length)*100):0;
  const { width: winW } = useWindowDimensions();
  const isNarrow = winW < 600; // celular em pé; tablets (mesmo em pé) ficam acima disso
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{ marginHorizontal:20, marginBottom:32, backgroundColor:'#fff', borderRadius:24, padding:22, flexDirection: isNarrow?'column':'row', alignItems: isNarrow?'stretch':'flex-start', gap: isNarrow?18:24 }}
    >
      <View style={{ width: isNarrow?'100%':'42%', maxWidth: isNarrow?undefined:280 }}>
        <View style={{ width:'100%', aspectRatio:1, borderRadius:20, overflow:'hidden', backgroundColor:C.sand2, alignItems:'center', justifyContent:'center' }}>
          <Image
            source={{ uri: imgFailed ? tc.bg : getTrailImage(trail) }}
            style={{ width:'100%', height:'100%' }}
            resizeMode="contain"
            onError={() => setImgFailed(true)}
          />
        </View>
        <View style={{ backgroundColor:C.navy, borderRadius:50, paddingVertical:13, alignItems:'center', marginTop:14 }}>
          <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>▶  Continuar</Text>
        </View>
      </View>

      <View style={{ flex: isNarrow?undefined:1, width: isNarrow?'100%':undefined, minWidth:0 }}>
        <View style={{ alignSelf:'flex-start', backgroundColor:'rgba(212,168,67,0.15)', paddingHorizontal:12, paddingVertical:5, borderRadius:20, marginBottom:12 }}>
          <Text style={{ color:C.sand, fontSize:10, fontWeight:'800', letterSpacing:1.5 }}>✦ EM DESTAQUE</Text>
        </View>
        <Text style={{ color:C.muted, fontSize:11, fontWeight:'700', letterSpacing:2, marginBottom:4 }}>TRILHA {trail.num} · {trail.icon}</Text>
        <Text style={{ color:C.navy, fontSize:24, fontWeight:'900', marginBottom:6, lineHeight:28 }}>{trail.name}</Text>
        <Text style={{ color:C.muted, fontSize:13, marginBottom:14, lineHeight:18 }}>{trail.desc}</Text>

        <View style={{ marginBottom:14 }}>
          {lessons.map((l,i) => {
            const isDone = !!done[`${trail.id}-${l.title}`];
            return (
              <View key={i} style={{ flexDirection:'row', alignItems:'center', marginBottom:6, gap:8 }}>
                <View style={{ width:18, height:18, borderRadius:9, alignItems:'center', justifyContent:'center', backgroundColor: isDone ? C.sand : C.sand2 }}>
                  <Text style={{ fontSize:9, fontWeight:'800', color: isDone ? '#fff' : C.muted }}>{isDone ? '✓' : i+1}</Text>
                </View>
                <Text style={{ flex:1, fontSize:12.5, color: isDone ? C.muted : C.navy, fontWeight: isDone ? '400' : '600' }} numberOfLines={1}>{l.title}</Text>
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <Text style={{ color:C.sand, fontSize:12, fontWeight:'800' }}>{pct}% concluído</Text>
          <Text style={{ color:C.muted, fontSize:11 }}>{watched}/{lessons.length} aulas</Text>
        </View>
        <View style={{ height:5, backgroundColor:C.sand2, borderRadius:3, overflow:'hidden' }}>
          <View style={{ height:'100%', width:`${pct}%`, backgroundColor:C.sand, borderRadius:3 }} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function LessonScreen({ trail, lesson, lessonKey, onBack, onComplete, isDone }) {
  const [currentFlashcard, setCurrentFlashcard] = useState(0);
  const tc = TRAIL_COLORS[trail.id]||TRAIL_COLORS['1'];
  const d = LESSON_DATA[lesson.title];
  const { width: winW, height: winH } = useWindowDimensions();
  const isPortrait = winH >= winW;
  const isTablet = Math.max(winW, winH) >= 900; // celular: imagem sempre aparece; tablet: só em pé
  const showHeroImage = !isTablet || isPortrait;

  // Fallback simples caso a aula não tenha dados estruturados
  if (!d) {
    return (
      <View style={{ flex:1, backgroundColor:'#F5F0E8' }}>
        <View style={{ backgroundColor:C.navy, padding:20, paddingTop:50 }}>
          <TouchableOpacity onPress={onBack}><Text style={{ color:'#fff', fontSize:16, opacity:0.8 }}>← Voltar</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding:24, paddingBottom:60 }}>
          <View style={{ backgroundColor:C.navy+'11', borderWidth:1, borderColor:C.navy+'33', alignSelf:'flex-start', paddingHorizontal:12, paddingVertical:4, borderRadius:20, marginBottom:16 }}>
            <Text style={{ fontSize:12, color:C.navy, fontWeight:'600' }}>{lesson.type==='checklist'?'✅ Checklist':'📖 Artigo'}</Text>
          </View>
          {showHeroImage && <Image source={{ uri: getLessonImage(lesson.title) }} style={{ width:'100%', aspectRatio:0.85, borderRadius:14, marginBottom:20 }} resizeMode="cover" />}
          <Text style={{ fontSize:22, fontWeight:'800', color:C.navy, marginBottom:20, lineHeight:30 }}>{lesson.title}</Text>
          <Text style={{ fontSize:15, color:C.text, lineHeight:26 }}>{lesson.content}</Text>
          <TouchableOpacity
            style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, borderRadius:50, borderWidth:1.5, borderColor:C.sand, paddingVertical:14, marginTop:24 }}
            onPress={() => Linking.openURL(getLessonPDF(lesson.title))}
          >
            <Text style={{ fontSize:16 }}>📄</Text>
            <Text style={{ color:C.navy, fontWeight:'700', fontSize:14 }}>Baixar conteúdo desta aula em PDF</Text>
          </TouchableOpacity>
          {!isDone ? (
            <TouchableOpacity style={{ backgroundColor:C.navy, padding:16, borderRadius:50, alignItems:'center', marginTop:40 }} onPress={onComplete}>
              <Text style={{ color:'#fff', fontWeight:'700', fontSize:15 }}>✓ Concluir aula</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ backgroundColor:C.sand2, padding:16, borderRadius:16, alignItems:'center', marginTop:40 }}>
              <Text style={{ color:tc.accent, fontWeight:'700', fontSize:14 }}>✓ Aula concluída</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex:1, backgroundColor:C.cream }}>
      <View style={{ backgroundColor:C.navy, paddingTop:50, paddingBottom:16, paddingHorizontal:20, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
        <TouchableOpacity onPress={onBack}><Text style={{ color:C.sand, fontSize:15, fontWeight:'600' }}>← Voltar</Text></TouchableOpacity>
        <Text style={{ color:'rgba(255,255,255,0.5)', fontSize:11, fontWeight:'700', letterSpacing:1 }}>TRILHA {trail.num} · {trail.name?.toUpperCase()}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom:40 }}>
        {showHeroImage && <Image source={{ uri: getLessonImage(lesson.title) }} style={{ width:'100%', aspectRatio:1.4 }} resizeMode="cover" />}
        <View style={{ padding:24, paddingBottom:8 }}>
          <Text style={{ fontSize:23, fontWeight:'800', color:C.navy, marginBottom:16, lineHeight:30 }}>{lesson.title}</Text>
          <Text style={{ fontSize:15, color:C.text, lineHeight:24, marginBottom:18 }}>{d.intro}</Text>
          {!!(d.objectives && d.objectives.length) && (
            <View style={{ backgroundColor:'#fff', borderRadius:14, padding:16, borderWidth:1, borderColor:C.sand2 }}>
              <Text style={{ fontSize:11, fontWeight:'800', color:C.navy, letterSpacing:1, marginBottom:8 }}>OBJETIVOS DA AULA</Text>
              {d.objectives.map((o,i) => <Text key={i} style={{ fontSize:13, color:C.text, lineHeight:20, marginBottom:4 }}>•  {o}</Text>)}
            </View>
          )}
        </View>

        {!!(d.accordion && d.accordion.length) && (<>
          <SectionDivider title="CONTEÚDO" />
          {d.accordion.map((item,i) => <AccordionItem key={i} index={i} title={item.title} description={item.description} />)}
        </>)}

        {!!d.example && (
          <View style={{ backgroundColor:'#fff', marginHorizontal:20, borderRadius:16, padding:20, marginVertical:8, borderLeftWidth:4, borderLeftColor:C.sand }}>
            <Text style={{ fontSize:11, fontWeight:'800', color:C.muted, letterSpacing:1, marginBottom:10 }}>UM EXEMPLO REAL</Text>
            <Text style={{ fontSize:14, color:C.text, lineHeight:22 }}>{d.example}</Text>
          </View>
        )}

        {!!(d.flashcards && d.flashcards.length) && (<>
          <SectionDivider title="REVISÃO RÁPIDA" />
          <Flashcard key={currentFlashcard} index={currentFlashcard} total={d.flashcards.length} front={d.flashcards[currentFlashcard].front} back={d.flashcards[currentFlashcard].back} audioTranscript={d.flashcards[currentFlashcard].audioTranscript} />
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginHorizontal:20, marginBottom:16, marginTop:8 }}>
            <TouchableOpacity style={{ paddingHorizontal:14, paddingVertical:8, backgroundColor:C.sand2, borderRadius:20, opacity: currentFlashcard===0?0.3:1 }} onPress={()=>setCurrentFlashcard(c=>Math.max(0,c-1))} disabled={currentFlashcard===0}>
              <Text style={{ fontSize:13, color:C.navy, fontWeight:'600' }}>← Anterior</Text>
            </TouchableOpacity>
            <View style={{ flexDirection:'row', gap:6 }}>
              {d.flashcards.map((_,i) => <TouchableOpacity key={i} onPress={()=>setCurrentFlashcard(i)}><View style={{ width: i===currentFlashcard?20:8, height:8, borderRadius:4, backgroundColor: i===currentFlashcard?C.navy:C.sand2 }} /></TouchableOpacity>)}
            </View>
            <TouchableOpacity style={{ paddingHorizontal:14, paddingVertical:8, backgroundColor:C.sand2, borderRadius:20, opacity: currentFlashcard===d.flashcards.length-1?0.3:1 }} onPress={()=>setCurrentFlashcard(c=>Math.min(d.flashcards.length-1,c+1))} disabled={currentFlashcard===d.flashcards.length-1}>
              <Text style={{ fontSize:13, color:C.navy, fontWeight:'600' }}>Próximo →</Text>
            </TouchableOpacity>
          </View>
        </>)}

        {!!(d.exercise && d.exercise.steps && d.exercise.steps.length) && (<>
          <SectionDivider title="EXERCÍCIO PRÁTICO" />
          <StepByStep intro={d.exercise.intro} steps={d.exercise.steps} summary={d.exercise.summary} />
        </>)}

        {!!d.quiz && (<>
          <SectionDivider title="TESTE SEU CONHECIMENTO" />
          {(Array.isArray(d.quiz) ? d.quiz : [d.quiz]).map((q, qi, arr) => (
            <LessonQuiz key={qi} question={q.question} answers={q.answers} questionIndex={qi+1} total={arr.length} />
          ))}
        </>)}

        {!!d.closing && (
          <View style={{ backgroundColor:C.sand2, marginHorizontal:20, borderRadius:16, padding:20, marginBottom:24 }}>
            <Text style={{ fontSize:14, color:C.text, lineHeight:22, fontStyle:'italic' }}>{d.closing}</Text>
          </View>
        )}

        <TouchableOpacity
          style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, marginHorizontal:20, borderRadius:50, borderWidth:1.5, borderColor:C.sand, paddingVertical:14, marginBottom:20 }}
          onPress={() => Linking.openURL(getLessonPDF(lesson.title))}
        >
          <Text style={{ fontSize:16 }}>📄</Text>
          <Text style={{ color:C.navy, fontWeight:'700', fontSize:14 }}>Baixar conteúdo desta aula em PDF</Text>
        </TouchableOpacity>

        {!isDone ? (
          <TouchableOpacity style={{ backgroundColor:C.navy, marginHorizontal:20, borderRadius:50, padding:18, alignItems:'center' }} onPress={onComplete}>
            <Text style={{ color:'#fff', fontWeight:'800', fontSize:15 }}>✓ Concluir aula</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ backgroundColor:C.sand2, marginHorizontal:20, borderRadius:16, padding:16, alignItems:'center' }}>
            <Text style={{ color:tc.accent, fontWeight:'700', fontSize:14 }}>✓ Aula concluída</Text>
          </View>
        )}
        <View style={{ height:40 }} />
      </ScrollView>
    </View>
  );
}

function TrailsTab({ setTab, user }) {
  const [lesson, setLesson] = useState(null);
  const [activeTrail, setActiveTrail] = useState(null);
  const [lessonKey, setLessonKey] = useState(null);
  const [done, setDone] = useState({});
  const [celebrating, setCelebrating] = useState(false);

  React.useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const r = await fetch(`${SUPA_URL}/rest/v1/lesson_progress?user_id=eq.${user.id}&select=trail_id,lesson_title`, { headers: { apikey:SUPA_KEY, Authorization:`Bearer ${_accessToken||SUPA_KEY}` } });
        const data = await r.json();
        if (!Array.isArray(data)) return;
        const newDone = {};
        data.forEach(row => { newDone[`${row.trail_id}-${row.lesson_title}`]=true; });
        setDone(newDone);
      } catch(e) {}
    };
    load();
  }, [user?.id]);

  const handleLessonPress = (trail, lesson, key) => { setActiveTrail(trail); setLesson(lesson); setLessonKey(key); };

  const handleComplete = async () => {
    setDone(d => ({ ...d, [lessonKey]:true }));
    setCelebrating(true);
    setTimeout(() => { setCelebrating(false); setLesson(null); setActiveTrail(null); }, 2000);
    if (user?.id) {
      try {
        await fetch(`${SUPA_URL}/rest/v1/lesson_progress`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', apikey:SUPA_KEY, Authorization:`Bearer ${_accessToken||SUPA_KEY}`, Prefer:'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ user_id:user.id, trail_id:activeTrail.id, lesson_title:lesson.title }),
        });
      } catch(e) {}
    }
  };

  if (celebrating) return (
    <View style={{ flex:1, backgroundColor:C.cream, alignItems:'center', justifyContent:'center', padding:40 }}>
      <Text style={{ fontSize:72, marginBottom:24 }}>🎉</Text>
      <Text style={{ fontSize:26, color:C.navy, fontWeight:'300', textAlign:'center', marginBottom:12 }}>Aula concluída!</Text>
      <Text style={{ fontSize:15, color:C.muted, textAlign:'center' }}>Continue sua travessia 🌿</Text>
    </View>
  );

  if (lesson && activeTrail) return (
    <LessonScreen trail={activeTrail} lesson={lesson} lessonKey={lessonKey} isDone={!!done[lessonKey]} onBack={()=>{setLesson(null);setActiveTrail(null);}} onComplete={handleComplete} />
  );

  const heroTrail = TRAILS.find(t => { const ls=TRAIL_CONTENT[t.id]||[]; return ls.some(l=>!done[`${t.id}-${l.title}`]); })||TRAILS[0];
  const totalDone = Object.keys(done).length;
  const totalLessons = 24;

  return (
    <View style={{ flex:1, backgroundColor:'#F5F0E8' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:100 }}>
        <View style={{ paddingHorizontal:20, paddingTop:60, paddingBottom:20, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <View>
            <Text style={{ color:C.navy, fontSize:22, fontWeight:'900', letterSpacing:-0.5 }}>Trilhas</Text>
            <Text style={{ color:C.muted, fontSize:12 }}>{totalDone} de {totalLessons} aulas concluídas</Text>
          </View>
          <View style={{ backgroundColor:C.sand2, borderRadius:12, paddingHorizontal:12, paddingVertical:6 }}>
            <Text style={{ color:C.navy, fontSize:13, fontWeight:'700' }}>{Math.round((totalDone/totalLessons)*100)}%</Text>
          </View>
        </View>
        <HeroBanner trail={heroTrail} done={done} onPress={() => {
          const ls=TRAIL_CONTENT[heroTrail.id]||[];
          const next=ls.find(l=>!done[`${heroTrail.id}-${l.title}`])||ls[0];
          if (next) handleLessonPress(heroTrail,next,`${heroTrail.id}-${next.title}`);
        }} />
        {TRAILS.map(trail => (
          <TrailRow key={trail.id} trail={trail} done={done} onLessonPress={handleLessonPress} />
        ))}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════
// COMUNIDADE
// ═══════════════════════════════════════
function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

function CommunityTab({ setTab, user }) {
  const [posts, setPosts] = useState([]);
  const [likes, setLikes] = useState([]); // [{post_id, user_id}]
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const loadFeed = async () => {
    try {
      const [pr, lr] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/community_posts?select=id,user_id,user_name,avatar,content,created_at&order=created_at.desc&limit=100`, {
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_accessToken || SUPA_KEY}` },
        }),
        fetch(`${SUPA_URL}/rest/v1/community_likes?select=post_id,user_id`, {
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_accessToken || SUPA_KEY}` },
        }),
      ]);
      const pdata = await pr.json();
      const ldata = await lr.json();
      setPosts(Array.isArray(pdata) ? pdata : []);
      setLikes(Array.isArray(ldata) ? ldata : []);
    } catch (e) {
      setPosts([]); setLikes([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { loadFeed(); }, []);

  const addPost = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/community_posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${_accessToken || SUPA_KEY}`, Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: user.id, user_name: user.name, avatar: '⭐', content: text.trim() }),
      });
      const data = await r.json();
      if (r.ok && Array.isArray(data) && data[0]) {
        setPosts(p => [data[0], ...p]);
        setText('');
      } else {
        const reason = data?.message || data?.hint || data?.error || 'Verifique se a tabela "community_posts" já foi criada no Supabase.';
        Alert.alert('Não foi possível publicar', reason);
      }
    } catch (e) {
      Alert.alert('Sem conexão', 'Verifique sua internet e tente novamente.');
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (postId) => {
    const already = likes.some(l => l.post_id === postId && l.user_id === user.id);
    if (already) {
      setLikes(ls => ls.filter(l => !(l.post_id === postId && l.user_id === user.id)));
      fetch(`${SUPA_URL}/rest/v1/community_likes?post_id=eq.${postId}&user_id=eq.${user.id}`, {
        method: 'DELETE',
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_accessToken || SUPA_KEY}` },
      }).catch(() => {});
    } else {
      setLikes(ls => [...ls, { post_id: postId, user_id: user.id }]);
      fetch(`${SUPA_URL}/rest/v1/community_likes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${_accessToken || SUPA_KEY}`, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ post_id: postId, user_id: user.id }),
      }).catch(() => {});
    }
  };

  return (
    <ScrollView style={cm.container} contentContainerStyle={cm.inner}>
      <TouchableOpacity style={{ marginBottom:16, alignSelf:'flex-start' }} onPress={()=>setTab('home')}><Text style={{ fontSize:14, color:C.sand, fontWeight:'600' }}>← Início</Text></TouchableOpacity>
      <Text style={cm.title}>Comunidade</Text>
      <View style={cm.compose}>
        <TextInput style={cm.input} placeholder="Compartilhe algo com a comunidade..." placeholderTextColor="#999" value={text} onChangeText={setText} multiline />
        <TouchableOpacity style={[cm.postBtn, (!text.trim()||posting)&&{opacity:0.5}]} onPress={addPost} disabled={!text.trim()||posting}>
          <Text style={cm.postBtnText}>{posting ? 'Publicando...' : 'Publicar'}</Text>
        </TouchableOpacity>
      </View>
      {loading && <ActivityIndicator color={C.navy} style={{ marginTop:20 }} />}
      {!loading && posts.length===0 && (
        <View style={{ alignItems:'center', paddingVertical:30 }}>
          <Text style={{ fontSize:14, color:C.muted, textAlign:'center' }}>Seja a primeira a compartilhar algo com a comunidade 🌿</Text>
        </View>
      )}
      {posts.map(p => {
        const likeCount = likes.filter(l => l.post_id === p.id).length;
        const likedByMe = likes.some(l => l.post_id === p.id && l.user_id === user.id);
        return (
          <View key={p.id} style={cm.post}>
            <View style={cm.postHeader}><Text style={cm.avatar}>{p.avatar || '⭐'}</Text><View><Text style={cm.postName}>{p.user_name}</Text><Text style={cm.postTime}>{timeAgo(p.created_at)}</Text></View></View>
            <Text style={cm.postText}>{p.content}</Text>
            <TouchableOpacity style={cm.likeRow} onPress={()=>toggleLike(p.id)}><Text style={{ fontSize:16 }}>{likedByMe?'❤️':'🤍'}</Text><Text style={cm.likeCount}>{likeCount}</Text></TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}
const cm = StyleSheet.create({
  container: { flex:1, backgroundColor:C.cream }, inner: { padding:24, paddingTop:60, paddingBottom:90 },
  title: { fontSize:22, fontWeight:'700', color:C.navy, marginBottom:20 },
  compose: { backgroundColor:'#fff', borderRadius:16, padding:16, marginBottom:20 },
  input: { fontSize:14, color:C.text, minHeight:70, textAlignVertical:'top', marginBottom:12 },
  postBtn: { backgroundColor:C.navy, padding:12, borderRadius:50, alignItems:'center' }, postBtnText: { color:'#fff', fontWeight:'700', fontSize:13 },
  post: { backgroundColor:'#fff', borderRadius:16, padding:18, marginBottom:12 },
  postHeader: { flexDirection:'row', alignItems:'center', gap:12, marginBottom:12 }, avatar: { fontSize:28 },
  postName: { fontWeight:'600', color:C.navy, fontSize:14 }, postTime: { fontSize:12, color:C.muted },
  postText: { fontSize:14, color:C.text, lineHeight:22, marginBottom:12 },
  likeRow: { flexDirection:'row', alignItems:'center', gap:6 }, likeCount: { fontSize:13, color:C.muted },
});

// ═══════════════════════════════════════
// MENTORIA
// ═══════════════════════════════════════
function MentorsTab({ setTab }) {
  const [selected, setSelected] = useState(null);
  if (selected) return (
    <View style={mn.container}>
      <View style={mn.detailHeader}><TouchableOpacity onPress={()=>setSelected(null)}><Text style={mn.back}>← Voltar</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={{ padding:24, paddingBottom:90 }}>
        <Image source={{ uri:selected.photo }} style={{ width:100, height:100, borderRadius:50, alignSelf:'center', marginVertical:20, backgroundColor:C.sand2 }} />
        <Text style={mn.detailName}>{selected.name}</Text><Text style={mn.detailSpec}>{selected.specialty}</Text>
        <View style={mn.stats}>
          <View style={mn.stat}><Text style={mn.statVal}>⭐ {selected.rating}</Text><Text style={mn.statLabel}>Avaliação</Text></View>
          <View style={mn.stat}><Text style={mn.statVal}>{selected.sessions}</Text><Text style={mn.statLabel}>Sessões</Text></View>
        </View>
        <Text style={{ fontSize:14, color:C.text, lineHeight:22, textAlign:'center', marginBottom:24, paddingHorizontal:8 }}>{selected.bio}</Text>
        <Text style={mn.slotsTitle}>Horários disponíveis</Text>
        {['Seg 10h','Ter 14h','Qua 16h','Sex 9h'].map((slot,i) => (
          <TouchableOpacity key={i} style={mn.slot} onPress={()=>Alert.alert('✓ Agendado!',`Sessão com ${selected.name} em ${slot} confirmada.`)}>
            <Text style={mn.slotText}>{slot}</Text><Text style={mn.slotBtn}>Agendar</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
  return (
    <ScrollView style={mn.container} contentContainerStyle={mn.inner}>
      <TouchableOpacity style={{ marginBottom:16, alignSelf:'flex-start' }} onPress={()=>setTab('home')}><Text style={{ fontSize:14, color:C.sand, fontWeight:'600' }}>← Início</Text></TouchableOpacity>
      <Text style={mn.title}>Mentoras</Text><Text style={mn.sub}>Especialistas para guiar sua travessia</Text>
      <TouchableOpacity style={mn.card} onPress={()=>Linking.openURL('https://wa.me/5574999134241?text=' + encodeURIComponent('Olá! Gostaria de agendar uma sessão de mentoria.'))}>
        <Image source={{ uri:'https://mlkhoibaqnvpkhziaidx.supabase.co/storage/v1/object/public/images/atendente.jpg?t=2' }} style={{ width:56, height:56, borderRadius:28, backgroundColor:C.sand2 }} />
        <View style={{ flex:1 }}><Text style={mn.name}>Fale com a gente</Text><Text style={mn.spec}>Agende pelo WhatsApp</Text><Text style={mn.rating}>💬 Resposta rápida</Text></View>
        <Text style={{ color:C.sand, fontSize:20 }}>→</Text>
      </TouchableOpacity>
      {MENTORS.map(m => (
        <TouchableOpacity key={m.id} style={mn.card} onPress={()=>setSelected(m)}>
          <Image source={{ uri:m.photo }} style={{ width:56, height:56, borderRadius:28, backgroundColor:C.sand2 }} />
          <View style={{ flex:1 }}><Text style={mn.name}>{m.name}</Text><Text style={mn.spec}>{m.specialty}</Text><Text style={mn.rating}>⭐ {m.rating} · {m.sessions} sessões</Text></View>
          <Text style={{ color:C.sand, fontSize:20 }}>→</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
const mn = StyleSheet.create({
  container: { flex:1, backgroundColor:C.cream }, inner: { padding:24, paddingTop:60, paddingBottom:90 },
  title: { fontSize:22, fontWeight:'700', color:C.navy, marginBottom:4 }, sub: { fontSize:14, color:C.muted, marginBottom:24 },
  card: { backgroundColor:'#fff', borderRadius:16, padding:18, marginBottom:12, flexDirection:'row', alignItems:'center', gap:14 },
  name: { fontWeight:'700', color:C.navy, fontSize:16, marginBottom:4 }, spec: { fontSize:13, color:C.muted, marginBottom:4 }, rating: { fontSize:12, color:C.sand, fontWeight:'600' },
  detailHeader: { backgroundColor:C.navy, padding:20, paddingTop:60 }, back: { color:C.sand, fontSize:16 },
  detailName: { fontSize:26, fontWeight:'700', color:C.navy, textAlign:'center', marginBottom:6 }, detailSpec: { fontSize:15, color:C.muted, textAlign:'center', marginBottom:24 },
  stats: { flexDirection:'row', gap:16, marginBottom:32 }, stat: { flex:1, backgroundColor:'#fff', borderRadius:14, padding:16, alignItems:'center' },
  statVal: { fontSize:20, fontWeight:'700', color:C.navy, marginBottom:4 }, statLabel: { fontSize:12, color:C.muted },
  slotsTitle: { fontSize:16, fontWeight:'700', color:C.navy, marginBottom:14 },
  slot: { backgroundColor:'#fff', borderRadius:12, padding:16, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  slotText: { fontSize:15, color:C.text }, slotBtn: { color:C.navy, fontWeight:'700', fontSize:14 },
});

// ═══════════════════════════════════════
// PERFIL
// ═══════════════════════════════════════
function ProfileTab({ user, onLogout }) {
  const [trailProgress, setTrailProgress] = React.useState({ current:'Diagnóstico', index:1, total:5 });
  const [activeSetting, setActiveSetting] = React.useState(null); // null | 'notif' | 'priv' | 'sup' | 'about'
  const [prefs, setPrefs] = React.useState({ notif_daily:true, notif_community:true, profile_public:true });
  const [prefsLoaded, setPrefsLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const r = await fetch(`${SUPA_URL}/rest/v1/lesson_progress?user_id=eq.${user.id}&select=trail_id`, { headers: { apikey:SUPA_KEY, Authorization:`Bearer ${_accessToken||SUPA_KEY}` } });
        const data = await r.json();
        if (!Array.isArray(data)) return;
        const trailsDone = [...new Set(data.map(r=>r.trail_id))];
        const trailNames = ['Diagnosticar','Organizar','Simplificar','Sustentar','Florescer'];
        const trailIds = ['1','2','3','4','5'];
        let currentIdx = 0;
        for (let i=0;i<trailIds.length;i++) { if (trailsDone.includes(trailIds[i])) currentIdx=i; }
        setTrailProgress({ current:trailNames[currentIdx], index:currentIdx+1, total:5 });
      } catch(e) {}
    };
    load();
  }, [user?.id]);

  React.useEffect(() => {
    if (!user?.id) return;
    const loadPrefs = async () => {
      try {
        const r = await fetch(`${SUPA_URL}/rest/v1/users?id=eq.${user.id}&select=notif_daily,notif_community,profile_public`, {
          headers: { apikey:SUPA_KEY, Authorization:`Bearer ${_accessToken||SUPA_KEY}`, Accept:'application/vnd.pgrst.object+json' },
        });
        const data = await r.json();
        if (r.ok && data) {
          setPrefs({
            notif_daily: data.notif_daily ?? false,
            notif_community: data.notif_community ?? true,
            profile_public: data.profile_public ?? true,
          });
          // Não agenda nada automaticamente aqui — só quando a usuária tocar no switch (updatePref).
        }
      } catch (e) {} finally { setPrefsLoaded(true); }
    };
    loadPrefs();
  }, [user?.id]);

  const updatePref = async (key, val) => {
    if (key === 'notif_daily') {
      const ok = await syncDailyReminder(val);
      if (val && ok === false) {
        Alert.alert('Permissão necessária', 'Ative as notificações para o Bridge nas configurações do seu aparelho para receber o lembrete diário.');
        return; // não liga o switch nem salva, já que a permissão foi negada
      }
    }
    setPrefs(p => ({ ...p, [key]: val }));
    fetch(`${SUPA_URL}/rest/v1/users?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', apikey:SUPA_KEY, Authorization:`Bearer ${_accessToken||SUPA_KEY}`, Prefer:'return=minimal' },
      body: JSON.stringify({ [key]: val }),
    }).catch(() => {});
  };

  const progressPct = `${Math.round((trailProgress.index/trailProgress.total)*100)}%`;

  // ── Sub-telas de configuração ──
  if (activeSetting) {
    return (
      <View style={pf.container}>
        <View style={pf.settingHeader}>
          <TouchableOpacity onPress={()=>setActiveSetting(null)}><Text style={pf.settingBack}>← Voltar</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding:24, paddingBottom:90 }}>
          {activeSetting==='notif' && (<>
            <Text style={pf.settingTitle}>Notificações</Text>
            <Text style={pf.settingSub}>Escolha o que você quer receber.</Text>
            <View style={pf.prefRow}>
              <View style={{ flex:1, paddingRight:12 }}>
                <Text style={pf.prefTitle}>Lembretes diários de estudo</Text>
                <Text style={pf.prefDesc}>Um aviso gentil para continuar sua travessia.</Text>
              </View>
              <Switch value={prefs.notif_daily} onValueChange={(v)=>updatePref('notif_daily', v)} trackColor={{ false:C.sand2, true:C.navy }} thumbColor="#fff" />
            </View>
            <View style={pf.prefRow}>
              <View style={{ flex:1, paddingRight:12 }}>
                <Text style={pf.prefTitle}>Novidades da comunidade</Text>
                <Text style={pf.prefDesc}>Curtidas e respostas nas suas publicações. (em breve — por enquanto só salva sua preferência)</Text>
              </View>
              <Switch value={prefs.notif_community} onValueChange={(v)=>updatePref('notif_community', v)} trackColor={{ false:C.sand2, true:C.navy }} thumbColor="#fff" />
            </View>
          </>)}

          {activeSetting==='priv' && (<>
            <Text style={pf.settingTitle}>Privacidade</Text>
            <Text style={pf.settingSub}>Como suas informações são usadas na Bridge.</Text>
            <View style={pf.prefRow}>
              <View style={{ flex:1, paddingRight:12 }}>
                <Text style={pf.prefTitle}>Perfil visível na comunidade</Text>
                <Text style={pf.prefDesc}>Outras alunas veem seu nome nas publicações que você fizer.</Text>
              </View>
              <Switch value={prefs.profile_public} onValueChange={(v)=>updatePref('profile_public', v)} trackColor={{ false:C.sand2, true:C.navy }} thumbColor="#fff" />
            </View>
            <View style={pf.infoCard}>
              <Text style={pf.infoText}>Seus dados de progresso (aulas concluídas, respostas do diagnóstico) são privados e usados apenas para personalizar sua experiência na Bridge. Suas publicações na comunidade são visíveis para outras alunas conforme a opção acima. Não compartilhamos suas informações com terceiros.</Text>
            </View>
          </>)}

          {activeSetting==='sup' && (<>
            <Text style={pf.settingTitle}>Suporte</Text>
            <Text style={pf.settingSub}>Perguntas frequentes e canais de contato.</Text>
            {SUPPORT_FAQ.map((f,i) => <AccordionItem key={i} index={i} title={f.q} description={f.a} />)}
            <TouchableOpacity style={pf.whatsBtn} onPress={()=>Linking.openURL('https://wa.me/5574999134241?text=' + encodeURIComponent('Olá! Preciso de ajuda com o app Bridge — A Travessia.'))}>
              <Text style={pf.whatsBtnText}>💬  Falar no WhatsApp</Text>
            </TouchableOpacity>
          </>)}

          {activeSetting==='about' && (<>
            <Text style={pf.settingTitle}>Sobre a Bridge</Text>
            <Text style={pf.aboutText}>Bridge — A Travessia é um programa guiado para mulheres que querem sair da sobrecarga doméstica e mental rumo a uma vida mais leve, organizada e intencional.</Text>
            <Text style={pf.aboutText}>Ao longo de 5 trilhas e 24 aulas, você constrói — no seu ritmo — sistemas simples que se sustentam, sem depender de motivação ou perfeição.</Text>
            <View style={pf.infoCard}>
              <Text style={pf.prefTitle}>Versão do app</Text>
              <Text style={pf.prefDesc}>1.0.0</Text>
            </View>
            <TouchableOpacity onPress={()=>Linking.openURL('https://bridgeatravessia.com.br')}>
              <Text style={pf.linkText}>bridgeatravessia.com.br</Text>
            </TouchableOpacity>
          </>)}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={pf.container} contentContainerStyle={pf.inner}>
      <View style={pf.header}>
        <View style={pf.avatarBox}><Text style={pf.avatarText}>{user.name[0]}</Text></View>
        <Text style={pf.name}>{user.name}</Text><Text style={pf.email}>{user.email}</Text>
        <View style={pf.planBadge}><Text style={pf.planText}>Plano Gratuito</Text></View>
      </View>
      <View style={pf.section}>
        <Text style={pf.sectionTitle}>Meu Progresso</Text>
        <View style={pf.progressCard}>
          <Text style={pf.progressLabel}>Etapa atual</Text>
          <Text style={pf.progressValue}>{trailProgress.current} ({trailProgress.index}/{trailProgress.total})</Text>
          <View style={pf.bar}><View style={[pf.barFill,{width:progressPct}]} /></View>
        </View>
      </View>
      <View style={pf.section}>
        <Text style={pf.sectionTitle}>Configurações</Text>
        {[{ key:'notif', label:'Notificações' }, { key:'priv', label:'Privacidade' }, { key:'sup', label:'Suporte' }, { key:'about', label:'Sobre a Bridge' }].map((item,i) => (
          <TouchableOpacity key={i} style={pf.item} onPress={()=>setActiveSetting(item.key)}><Text style={pf.itemText}>{item.label}</Text><Text style={{ color:C.muted }}>→</Text></TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={pf.logout} onPress={onLogout}><Text style={pf.logoutText}>Sair da conta</Text></TouchableOpacity>
    </ScrollView>
  );
}
const SUPPORT_FAQ = [
  { q: 'Como recupero minha senha?', a: 'Na tela de login, saia do app e entre novamente escolhendo "Entrar". Caso tenha esquecido sua senha, entre em contato pelo WhatsApp abaixo que ajudamos a redefinir.' },
  { q: 'Posso acessar o app em mais de um aparelho?', a: 'Sim! Basta entrar com o mesmo e-mail e senha em qualquer aparelho. Seu progresso é sincronizado automaticamente.' },
  { q: 'Meu progresso não está sendo salvo, o que faço?', a: 'Verifique sua conexão com a internet — o progresso é salvo automaticamente ao concluir cada aula. Se o problema continuar, fale com a gente pelo WhatsApp.' },
  { q: 'Como agendo uma sessão de mentoria?', a: 'Vá até a aba Mentoria, escolha uma mentora e toque em um dos horários disponíveis para confirmar o agendamento.' },
];
const pf = StyleSheet.create({
  container: { flex:1, backgroundColor:C.cream }, inner: { padding:24, paddingTop:60, paddingBottom:90 },
  header: { alignItems:'center', marginBottom:32 },
  avatarBox: { width:80, height:80, borderRadius:40, backgroundColor:C.navy, alignItems:'center', justifyContent:'center', marginBottom:12 },
  avatarText: { fontSize:32, color:'#fff', fontWeight:'700' }, name: { fontSize:22, fontWeight:'700', color:C.navy, marginBottom:4 },
  email: { fontSize:14, color:C.muted, marginBottom:12 }, planBadge: { backgroundColor:C.sand2, paddingHorizontal:16, paddingVertical:6, borderRadius:20 },
  planText: { color:C.navy, fontSize:13, fontWeight:'600' }, section: { marginBottom:24 },
  sectionTitle: { fontSize:14, fontWeight:'700', color:C.muted, letterSpacing:1, textTransform:'uppercase', marginBottom:12 },
  progressCard: { backgroundColor:'#fff', borderRadius:16, padding:18 }, progressLabel: { fontSize:12, color:C.muted, marginBottom:4 },
  progressValue: { fontSize:18, fontWeight:'700', color:C.navy, marginBottom:12 }, bar: { height:6, backgroundColor:C.sand2, borderRadius:3 },
  barFill: { height:'100%', backgroundColor:C.sand, borderRadius:3 },
  item: { backgroundColor:'#fff', borderRadius:12, padding:16, marginBottom:8, flexDirection:'row', justifyContent:'space-between' }, itemText: { fontSize:15, color:C.text },
  logout: { backgroundColor:'#fff', borderRadius:50, padding:16, alignItems:'center', borderWidth:1.5, borderColor:C.red }, logoutText: { color:C.red, fontWeight:'700', fontSize:15 },
  settingHeader: { backgroundColor:C.navy, padding:20, paddingTop:60 }, settingBack: { color:C.sand, fontSize:16, fontWeight:'600' },
  settingTitle: { fontSize:22, fontWeight:'700', color:C.navy, marginBottom:6 }, settingSub: { fontSize:14, color:C.muted, marginBottom:20 },
  prefRow: { backgroundColor:'#fff', borderRadius:14, padding:16, flexDirection:'row', alignItems:'center', marginBottom:10 },
  prefTitle: { fontSize:14, fontWeight:'700', color:C.navy, marginBottom:2 }, prefDesc: { fontSize:12, color:C.muted, lineHeight:17 },
  infoCard: { backgroundColor:'#fff', borderRadius:14, padding:16, marginTop:10 }, infoText: { fontSize:13, color:C.text, lineHeight:20 },
  whatsBtn: { backgroundColor:'#25D366', borderRadius:50, padding:16, alignItems:'center', marginTop:16 }, whatsBtnText: { color:'#fff', fontWeight:'700', fontSize:15 },
  aboutText: { fontSize:14, color:C.text, lineHeight:23, marginBottom:14 },
  linkText: { color:C.navy, fontWeight:'700', fontSize:14, marginTop:14, textDecorationLine:'underline' },
});

// ═══════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════
const TABS = [
  { id:'home', label:'Início', icon:'🏠' }, { id:'trails', label:'Trilhas', icon:'🛤️' },
  { id:'community', label:'Comunidade', icon:'🤝' }, { id:'mentors', label:'Mentoria', icon:'💬' },
  { id:'profile', label:'Perfil', icon:'👤' },
];

function AppInner() {
  const [screen, setScreen] = useState('onboarding');
  const [tab, setTab] = useState('home');
  const [user, setUser] = useState(null);
  const insets = useSafeAreaInsets();

  const handleLogin = async (u) => {
    setUser(u);
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/diagnostics?user_id=eq.${u.id}&limit=1`, { headers: { apikey:SUPA_KEY, Authorization:`Bearer ${_accessToken||SUPA_KEY}` } });
      const data = await r.json();
      setScreen(Array.isArray(data)&&data.length>0?'main':'diagnostic');
    } catch(e) { setScreen('diagnostic'); }
  };

  if (screen==='onboarding') return <OnboardingScreen onFinish={()=>setScreen('auth')} />;
  if (screen==='auth')       return <AuthScreen onLogin={handleLogin} />;
  if (screen==='diagnostic') return <DiagnosticScreen onFinish={()=>setScreen('main')} userId={user?.id} />;

  return (
    <View style={{ flex:1, backgroundColor:C.cream }}>
      <View style={{ flex:1 }}>
        {tab==='home'      && <HomeTab user={user} />}
        {tab==='trails'    && <TrailsTab setTab={setTab} user={user} />}
        {tab==='community' && <CommunityTab setTab={setTab} user={user} />}
        {tab==='mentors'   && <MentorsTab setTab={setTab} />}
        {tab==='profile'   && <ProfileTab user={user} onLogout={()=>{ setUser(null); setScreen('onboarding'); }} />}
      </View>
      <View style={[app.tabBar, { flexShrink:0, height: 70 + insets.bottom, paddingBottom: 16 + insets.bottom }]}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} style={app.tabItem} onPress={()=>setTab(t.id)} activeOpacity={0.6}>
            <Text style={{ fontSize:22, opacity:tab===t.id?1:0.4 }}>{t.icon}</Text>
            <Text style={{ fontSize:9, color:tab===t.id?C.sand:'rgba(255,255,255,.4)', fontWeight:'600', textTransform:'uppercase', marginTop:2 }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}
const app = StyleSheet.create({
  tabBar: { flexDirection:'row', backgroundColor:C.navy, height:70, borderTopWidth:1, borderTopColor:'rgba(200,184,154,.15)', paddingTop:8, paddingBottom:16, flexShrink:0 },        
  tabItem: { flex:1, alignItems:'center', justifyContent:'center' },
});