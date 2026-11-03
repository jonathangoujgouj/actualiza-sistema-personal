// Agrega esto en tu estructura inicial de datos (server.js)
const configuracionCloud = {
    modoOnlineHabilitado: false, // Activar cuando contrates dominio/internet
    urlWebExterna: "",          // Ej: https://labarrita.com
    aceptarReservacionesWeb: true,
    aceptarPedidosDomicilio: true
};

// Endpoint comodín preparado para recibir pedidos o reservaciones futuras desde internet
app.post('/api/cloud/sincronizar-externo', express.json(), (req, res) => {
    const db = leerDB();
    if (!db.config.modoOnlineHabilitado) {
        return res.status(403).json({ success: false, mensaje: "El sistema está operando en modo local cerrado." });
    }
    
    // Aquí entrarán en el futuro los pedidos de la web o app de clientes
    const nuevoPedidoWeb = req.body;
    db.comandas.unshift(nuevoPedidoWeb);
    guardarDB(db);
    
    // Notificar a las pantallas locales por Socket.io en tiempo real
    io.emit('sincronizar_todo', filtrarDatosParaCliente(db));
    io.emit('sonido_comanda_nueva', { mesa: nuevoPedidoWeb.mesa });
    
    res.json({ success: true, mensaje: "Pedido web recibido e inyectado en el POS local." });
});
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

const PORT = 3000;
const DB_FILE = path.join(__dirname, 'datos.json');
const PUBLICIDAD_DIR = path.join(__dirname, 'public', 'publicidad');
const IMAGENES_DIR = path.join(__dirname, 'public', 'imagenes');

if (!fs.existsSync(PUBLICIDAD_DIR)) fs.mkdirSync(PUBLICIDAD_DIR, { recursive: true });
if (!fs.existsSync(IMAGENES_DIR)) fs.mkdirSync(IMAGENES_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));

const estadoInicial = {
    caja: { abierta: false, fondoInicial: 0, horaApertura: null, fechaApertura: null },
    usuarios: [
        { id: 1, usuario: "admin", pin: "1234", nombre: "Administrador", permisos: { menu: true, mapa: true, barra: true, inventario: true, admin: true } },
        { id: 2, usuario: "mesero1", pin: "1111", nombre: "Mesero Turno 1", permisos: { menu: true, mapa: true, barra: false, inventario: false, admin: false } },
        { id: 3, usuario: "barra1", pin: "2222", nombre: "Barra Central", permisos: { menu: false, mapa: false, barra: true, inventario: false, admin: false } }
    ],
    productos: [
        { id: 1, nombre: "Alitas BBQ (10 pz)", descripcion: "Alitas bañadas en salsa BBQ.", imagen: "", costo: 60, precio: 110, categoria: "Alitas", stock: 50, tipo: "individual" },
        { id: 2, nombre: "Combo Alitas + Papas", descripcion: "10 Alitas + Papas a la francesa.", imagen: "", costo: 85, precio: 165, categoria: "Combos", stock: 50, tipo: "combo", componentes: [{id: 1, cant: 1}, {id: 4, cant: 1}] },
        { id: 3, nombre: "Michelada Familiar", descripcion: "Michelada de 1 litro.", imagen: "", costo: 45, precio: 95, categoria: "Micheladas", stock: 60, tipo: "individual" },
        { id: 4, nombre: "Papas a la Francesa", descripcion: "Orden regular de papas.", imagen: "", costo: 25, precio: 65, categoria: "Snacks", stock: 50, tipo: "individual" }
    ],
    mesas: [
        { id: 'Mesa 1', x: 10, y: 10 }, { id: 'Mesa 2', x: 30, y: 10 }, { id: 'Mesa 3', x: 50, y: 10 },
        { id: 'Mesa 4', x: 10, y: 30 }, { id: 'Mesa 5', x: 30, y: 30 }, { id: 'Mesa 6', x: 50, y: 30 },
        { id: 'Barra', x: 10, y: 50 }, { id: 'Para Llevar', x: 50, y: 50 }
    ],
    comandas: [],
    historialVentas: [],
    egresos: [],
    clientesRegistrados: [],
    propinas: [],
    mensajesChat: [],
    listaCompras: [],
    config: {
        nombreNegocio: "LA BARRITA PRO",
        logoUrl: "", 
        fondoPantallaUrl: "",
        promoTexto: "🔥 PROMOCIÓN ESTELAR: 2x1 EN MICHELADAS Y ALITAS HASTA LAS 9:00 PM 🍺",
        promoTextoInferior: "📲 Wi-Fi: LaBarrita_VIP • Pide desde tu móvil",
        tamanoTextoSup: 20,
        tamanoTextoInf: 15,
        redesUrl: "",
        mediaUrl: "",
        mostrarYouTube: false, 
        videoConAudio: false,
        skinSeleccionada: "tech-neon"
    }
};

function leerDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify(estadoInicial, null, 2), 'utf-8');
            return JSON.parse(JSON.stringify(estadoInicial));
        }
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        if (!data.mesas) data.mesas = estadoInicial.mesas;
        if (!data.mensajesChat) data.mensajesChat = [];
        if (!data.listaCompras) data.listaCompras = [];
        
        if (!data.config) data.config = estadoInicial.config;
        if (data.config.logoUrl === undefined) data.config.logoUrl = "";
        if (data.config.fondoPantallaUrl === undefined) data.config.fondoPantallaUrl = "";
        if (data.config.mostrarYouTube === undefined) data.config.mostrarYouTube = false;

        if (data.usuarios && data.usuarios.length > 0 && !data.usuarios[0].permisos) {
            data.usuarios = data.usuarios.map(u => {
                if (u.rol === 'admin') u.permisos = { menu: true, mapa: true, barra: true, inventario: true, admin: true };
                else if (u.rol === 'mesero') u.permisos = { menu: true, mapa: true, barra: false, inventario: false, admin: false };
                else if (u.rol === 'barra') u.permisos = { menu: false, mapa: false, barra: true, inventario: false, admin: false };
                else u.permisos = { menu: true, mapa: true, barra: false, inventario: false, admin: false };
                delete u.rol;
                return u;
            });
        }
        data.productos.forEach(p => { 
            if(!p.imagen) p.imagen = ""; 
            if(!p.descripcion) p.descripcion = ""; 
            if(!p.tipo) p.tipo = "individual"; 
        });
        return data;
    } catch (err) {
        return JSON.parse(JSON.stringify(estadoInicial));
    }
}

function guardarDB(data) {
    fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8', (err) => {
        if (err) console.error('Error guardando DB:', err);
    });
}

function obtenerIPLocal() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

function obtenerArchivos(directorio, rutaRelativa) {
    try {
        if (!fs.existsSync(directorio)) return [];
        const archivos = fs.readdirSync(directorio);
        const formatosValidos = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.webm', '.gif'];
        return archivos.filter(f => formatosValidos.includes(path.extname(f).toLowerCase()))
                       .map(f => `${rutaRelativa}/${f}`);
    } catch (err) { return []; }
}
function cambiarTabMovil(vista) {
  const paneles = {
    mapa: document.getElementById('panel-vista-mapa'),
    menu: document.getElementById('panel-vista-menu'),
    checkout: document.getElementById('panel-vista-checkout')
  };

  Object.keys(paneles).forEach(k => {
    if (!paneles[k]) return;
    if (k === vista) {
      paneles[k].classList.remove('hidden');
      paneles[k].classList.add('flex');
    } else {
      paneles[k].classList.add('hidden');
      paneles[k].classList.remove('flex');
    }
  });
}
function filtrarDatosParaCliente(db) {
    const copia = JSON.parse(JSON.stringify(db));
    return {
        ...copia,
        ipLocal: obtenerIPLocal(),
        archivosPublicidad: obtenerArchivos(PUBLICIDAD_DIR, '/publicidad'),
        archivosImagenes: obtenerArchivos(IMAGENES_DIR, '/imagenes')
    };
}

io.on('connection', (socket) => {
    const db = leerDB();
    socket.emit('sincronizar_todo', filtrarDatosParaCliente(db));

    socket.on('login_usuario', ({ usuario, pin }, callback) => {
        const actual = leerDB();
        const user = actual.usuarios.find(u => String(u.usuario).toLowerCase() === String(usuario).trim().toLowerCase() && String(u.pin) === String(pin).trim());
        if (user) {
            socket.data.usuario = user.usuario;
            const isSuperAdmin = user.permisos && user.permisos.admin;
            callback({ success: true, rol: isSuperAdmin ? 'admin' : 'usuario', nombre: user.nombre, usuario: user.usuario, permisos: user.permisos });
        } else {
            callback({ success: false, mensaje: 'Credenciales inválidas' });
        }
    });

    socket.on('abrir_caja', (montoInicial) => {
        const actual = leerDB();
        actual.caja = { abierta: true, fondoInicial: parseFloat(montoInicial) || 0, horaApertura: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), fechaApertura: new Date().toLocaleDateString() };
        guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
    });

    socket.on('registrar_egreso', ({ concepto, monto }) => {
        const actual = leerDB();
        actual.egresos.unshift({ id: Date.now(), concepto: concepto || 'Gasto', monto: parseFloat(monto) || 0, hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
    });

    socket.on('cerrar_corte_caja', (callback) => {
        const actual = leerDB();
        actual.caja = { abierta: false, fondoInicial: 0, horaApertura: null, fechaApertura: null };
        actual.historialVentas = []; actual.egresos = []; actual.propinas = []; actual.mensajesChat = [];
        guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
        if (typeof callback === 'function') callback({ success: true });
    });

    socket.on('guardar_usuario', (nuevoUser) => {
        const actual = leerDB();
        if (nuevoUser.id) {
            const idx = actual.usuarios.findIndex(u => u.id === nuevoUser.id);
            if (idx !== -1) actual.usuarios[idx] = nuevoUser;
        } else { nuevoUser.id = Date.now(); actual.usuarios.push(nuevoUser); }
        guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
    });

    socket.on('eliminar_usuario', (idUser) => {
        const actual = leerDB();
        if (actual.usuarios.length > 1) { actual.usuarios = actual.usuarios.filter(u => u.id !== idUser); guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual)); }
    });

    socket.on('nueva_orden', (nuevaComanda) => {
        const actual = leerDB();
        if (Array.isArray(nuevaComanda.items)) {
            for (let item of nuevaComanda.items) {
                const prod = actual.productos.find(p => p.id === item.id);
                if (prod) {
                    if (prod.tipo === 'combo' && prod.componentes) {
                        prod.componentes.forEach(comp => {
                            const subProd = actual.productos.find(sp => sp.id === comp.id);
                            if (subProd) {
                                subProd.stock = Math.max(0, subProd.stock - (parseInt(item.cantidad, 10) * comp.cant));
                                if(subProd.stock > 0 && subProd.stock <= 5) io.emit('alerta_stock_bajo', { nombre: subProd.nombre, stock: subProd.stock });
                                else if(subProd.stock === 0) io.emit('alerta_stock_bajo', { nombre: subProd.nombre, agotado: true });
                            }
                        });
                    } else {
                        prod.stock = Math.max(0, prod.stock - (parseInt(item.cantidad, 10) || 0));
                        if(prod.stock > 0 && prod.stock <= 5) io.emit('alerta_stock_bajo', { nombre: prod.nombre, stock: prod.stock });
                        else if(prod.stock === 0) io.emit('alerta_stock_bajo', { nombre: prod.nombre, agotado: true });
                    }
                }
            }
        }
        actual.comandas.unshift(nuevaComanda);
        guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual)); io.emit('sonido_comanda_nueva', { mesa: nuevaComanda.mesa });
    });

    socket.on('pedido_listo', (idComanda) => {
        const actual = leerDB();
        const comanda = actual.comandas.find(c => c.id === idComanda);
        if (comanda) {
            comanda.estado = 'Listo'; guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
            io.emit('notificacion_pedido_listo', { id: comanda.id, mesa: comanda.mesa, mesero: comanda.mesero || 'General' });
        }
    });

    socket.on('cobrar_orden', (datosCobro) => {
        const actual = leerDB();
        const idx = actual.comandas.findIndex(c => c.id === datosCobro.idComanda);
        if (idx !== -1) {
            const cobrada = actual.comandas.splice(idx, 1)[0];
            cobrada.propina = parseFloat(datosCobro.propina) || 0; cobrada.mesero = datosCobro.mesero || 'General';
            cobrada.metodoPago = datosCobro.metodoPago || 'Efectivo'; cobrada.montoRecibido = parseFloat(datosCobro.montoRecibido) || cobrada.total;
            cobrada.cambio = parseFloat(datosCobro.cambio) || 0; cobrada.horaCobro = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            let costoTotalOrden = 0;
            if (Array.isArray(cobrada.items)) {
                for (let it of cobrada.items) {
                    const refProd = actual.productos.find(p => p.id === it.id);
                    costoTotalOrden += (refProd && refProd.costo ? refProd.costo : 0) * it.cantidad;
                }
            }
            cobrada.costoInsumos = costoTotalOrden; cobrada.gananciaNeta = Math.max(0, cobrada.total - costoTotalOrden);
            actual.historialVentas.unshift(cobrada);
            if (cobrada.propina > 0) actual.propinas.unshift({ mesero: cobrada.mesero, monto: cobrada.propina, hora: cobrada.horaCobro, mesa: cobrada.mesa });
            guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
        }
    });

    socket.on('actualizar_productos', (nuevosProductos) => {
        const actual = leerDB(); actual.productos = nuevosProductos; guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
    });

    socket.on('registrar_compra_stock', ({ idProducto, cantidadSumar, nuevoCosto }) => {
        const actual = leerDB();
        const p = actual.productos.find(x => x.id === parseInt(idProducto, 10));
        if (p) {
            p.stock = (parseInt(p.stock, 10) || 0) + parseInt(cantidadSumar, 10);
            if (nuevoCosto && !isNaN(parseFloat(nuevoCosto))) p.costo = parseFloat(nuevoCosto);
            guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
        }
    });
    
    socket.on('agregar_insumo', (texto) => {
        const actual = leerDB();
        if(!actual.listaCompras) actual.listaCompras = [];
        actual.listaCompras.unshift({ id: Date.now(), texto: texto });
        guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
    });
    socket.on('eliminar_insumo', (id) => {
        const actual = leerDB();
        if(actual.listaCompras) actual.listaCompras = actual.listaCompras.filter(x => x.id !== id);
        guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
    });

    socket.on('actualizar_config', (nuevaConfig) => {
        const actual = leerDB(); actual.config = Object.assign({}, actual.config, nuevaConfig); guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual));
    });
    
    socket.on('guardar_posicion_mesa', ({ id, x, y }) => {
        const actual = leerDB();
        const mesa = actual.mesas.find(m => m.id === id);
        if(mesa) { mesa.x = x; mesa.y = y; guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual)); }
    });

    socket.on('enviar_mensaje_chat', (mensaje) => {
        const actual = leerDB();
        actual.mensajesChat.push({ ...mensaje, hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        if (actual.mensajesChat.length > 50) actual.mensajesChat.shift();
        guardarDB(actual); io.emit('sincronizar_todo', filtrarDatosParaCliente(actual)); io.emit('notificacion_chat', mensaje);
    });

    socket.on('sincronizar_github', (datos, callback) => {
        const tipo = datos.tipo || 'chore';
        const detalle = datos.detalle || 'Actualización desde el panel de control';
        const mensaje = `${tipo}: ${detalle}`;

        exec(`git add . && git commit -m "${mensaje}" && git push`, (error, stdout, stderr) => {
            if (error) {
                if (stdout.includes('nothing to commit')) {
                    callback({ success: false, mensaje: 'No hay cambios nuevos para guardar.' });
                } else {
                    callback({ success: false, mensaje: 'Error al sincronizar. Revisa la consola.', detalle: stderr });
                }
                return;
            }
            callback({ success: true, mensaje: '¡Sistema actualizado en GitHub exitosamente!' });
        });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const ip = obtenerIPLocal();
    console.log('====================================================');
    console.log(` 🍻 SERVIDOR LA BARRITA POS PRO INICIADO`);
    console.log(` 🖥️  Caja / Host: http://localhost:${PORT}`);
    console.log(` 📱 Terminales y Móviles: http://${ip}:${PORT}`);
    console.log('====================================================');
});
