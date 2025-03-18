// STEAMPUNK ULTIMATE MOD v2.0
// Complete Victorian-era simulation system for Sandboxels

/* CORE CONSTANTS */
const STEAM_PRESSURE_MAX = 150;
const AETHER_CHARGE_MAX = 100;
const GEAR_TORQUE_MAX = 50;

/* GLOBAL SYSTEMS */
let machineNetworks = {
    steam: { pipes: [], valves: [], engines: [] },
    aether: { beacons: [], dynamos: [], coils: [] },
    mechanical: { gears: [], drivers: [], actuators: [] }
};

let pressureMap = new Map();
let aetherMap = new Map();

/* ELEMENT DEFINITIONS */
elements.brass = {
    color: "#b5a642",
    behavior: behaviors.WALL,
    category: "materials",
    density: 8400,
    conduct: 0.6,
    tempHigh: 900,
    stateHigh: "molten_brass"
};

elements.steam_engine = {
    color: ["#654321", "#563412", "#472901"],
    behavior: [
        ["CR:steam_pipe%20", "EX:fire%3 AND CH:steam%5", "CR:steam_pipe%20"],
        ["M2", "DL:engine_core", "M2"],
        ["XX", "M1", "XX"]
    ],
    category: "power",
    density: 8500,
    pressure: 0,
    stress: 0,
    tempHigh: 800,
    stateHigh: "molten_brass",
    description: "Converts thermal energy to mechanical power"
};

elements.aether_beacon = {
    color: ["#e6e6fa", "#d8d8f5", "#cacaf0"],
    behavior: [
        "XX|CR:aether%0.2|XX",
        "CR:aether%0.2|XX|CR:aether%0.2",
        "XX|CR:aether%0.2|XX"
    ],
    category: "energy",
    density: 200,
    charge: 0,
    description: "Wireless aetheric energy transmitter"
};

elements.clockwork_gear = {
    color: "#8B4513",
    behavior: behaviors.SOLID,
    category: "mechanical",
    density: 7500,
    rotation: 0,
    torque: 0,
    description: "Power transmission component"
};

/* SYSTEM MANAGERS */
function updateNetworks() {
    // Reset network tracking
    machineNetworks = {
        steam: { pipes: [], valves: [], engines: [] },
        aether: { beacons: [], dynamos: [], coils: [] },
        mechanical: { gears: [], drivers: [], actuators: [] }
    };

    // Categorize all elements
    currentPixels.forEach(pixel => {
        switch(pixel.element) {
            case "steam_pipe":
                machineNetworks.steam.pipes.push(pixel);
                break;
            case "steam_engine":
                machineNetworks.steam.engines.push(pixel);
                break;
            case "aether_beacon":
                machineNetworks.aether.beacons.push(pixel);
                break;
            case "clockwork_gear":
                machineNetworks.mechanical.gears.push(pixel);
                break;
        }
    });
}

function manageSteamSystem() {
    // Pressure propagation
    machineNetworks.steam.pipes.forEach(pipe => {
        if(pipe.pressure > 0) {
            getNeighbors(pipe.x, pipe.y).forEach(neighbor => {
                if(neighbor.element === "steam_pipe" && neighbor.pressure < pipe.pressure) {
                    const transfer = (pipe.pressure - neighbor.pressure) * 0.2;
                    neighbor.pressure += transfer;
                    pipe.pressure -= transfer;
                }
            });
            
            // Thermal effects
            pipe.temp += pipe.pressure * 0.1;
            if(pipe.temp > 500) pipe.element = "superheated_steam";
        }
    });

    // Engine operation
    machineNetworks.steam.engines.forEach(engine => {
        if(engine.temp > 300) {
            engine.pressure = Math.min(engine.pressure + 2, STEAM_PRESSURE_MAX);
            createPixel("steam", engine.x, engine.y-1);
        }
    });
}

function manageAetherSystem() {
    // Wireless energy transfer
    machineNetworks.aether.beacons.forEach(beacon => {
        machineNetworks.aether.beacons.forEach(target => {
            if(beacon !== target && beacon.channel === target.channel) {
                const transfer = Math.min(beacon.charge, AETHER_CHARGE_MAX - target.charge);
                beacon.charge -= transfer;
                target.charge += transfer;
                
                if(transfer > 5) {
                    createPixel("spark", target.x, target.y-1, {
                        charge: transfer,
                        color: ["#EE82EE", "#4B0082"]
                    });
                }
            }
        });
    });
}

function manageMechanicalSystem() {
    // Gear torque transmission
    machineNetworks.mechanical.gears.forEach(gear => {
        getNeighbors(gear.x, gear.y).forEach(neighbor => {
            if(neighbor.element === "clockwork_gear" && neighbor.torque < gear.torque) {
                const transfer = Math.min(gear.torque - neighbor.torque, GEAR_TORQUE_MAX);
                neighbor.torque += transfer;
                gear.torque -= transfer;
            }
        });
        
        // Visual rotation
        gear.rotation = (gear.rotation + gear.torque/10) % 360;
    });
}

/* RENDERING SYSTEM */
function drawConnections(ctx) {
    // Steam connections
    machineNetworks.steam.pipes.forEach(pipe => {
        if(pipe.linkedValve) {
            const valve = pipe.linkedValve;
            const pressureRatio = pipe.pressure / STEAM_PRESSURE_MAX;
            
            ctx.beginPath();
            ctx.moveTo(valve.x * pixelSize + pixelSizeHalf, valve.y * pixelSize + pixelSizeHalf);
            ctx.lineTo(pipe.x * pixelSize + pixelSizeHalf, pipe.y * pixelSize + pixelSizeHalf);
            ctx.strokeStyle = `hsla(30, 70%, ${50 + (Date.now()%2000/2000*30)}%, ${0.3 + pressureRatio*0.7})`;
            ctx.lineWidth = 3 + pressureRatio*5;
            ctx.stroke();
        }
    });

    // Aether links
    machineNetworks.aether.beacons.forEach(beacon => {
        machineNetworks.aether.beacons.forEach(target => {
            if(beacon !== target && beacon.channel === target.channel) {
                const gradient = ctx.createLinearGradient(
                    beacon.x * pixelSize, beacon.y * pixelSize,
                    target.x * pixelSize, target.y * pixelSize
                );
                gradient.addColorStop(0, `rgba(230,230,250,${beacon.charge/AETHER_CHARGE_MAX})`);
                gradient.addColorStop(1, `rgba(180,180,250,${target.charge/AETHER_CHARGE_MAX})`);
                
                ctx.setLineDash([5, 15]);
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 2 + (beacon.charge/AETHER_CHARGE_MAX)*4;
                ctx.beginPath();
                ctx.moveTo(beacon.x * pixelSize + pixelSizeHalf, beacon.y * pixelSize + pixelSizeHalf);
                ctx.lineTo(target.x * pixelSize + pixelSizeHalf, target.y * pixelSize + pixelSizeHalf);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });
    });
}

/* FAILURE STATES */
elements.superheated_steam = {
    color: "#FF4500",
    behavior: [
        "XX|EX:fire%5|XX",
        "XX|CR:explosion%2|XX",
        "XX|M1|XX"
    ],
    category: "hazard",
    temp: 1200,
    description: "Dangerous overheated steam system!"
};

/* INITIALIZATION */
runAfterLoad(function() {
    // Context menu integration
    addContext("steam_pipe", "Set Pressure", pixel => {
        pixel.pressure = Math.min(STEAM_PRESSURE_MAX, 
            Number(prompt("Pressure (0-150):")) || 0
        );
    });
    
    addContext("aether_beacon", "Tune Channel", pixel => {
        pixel.channel = (Number(prompt("Channel (1-9):")) || 1) % 10;
    });

    // System hooks
    renderPostPixel(() => {
        updateNetworks();
        drawConnections();
    });
    
    renderPostUpdate(() => {
        manageSteamSystem();
        manageAetherSystem();
        manageMechanicalSystem();
    });
});
