import { NextResponse } from 'next/server';
// Secure by default: this route must not expose tenant data until auth/RBAC/Neon are implemented.
export async function GET(){return NextResponse.json({error:'NOT_IMPLEMENTED',message:'Requires authenticated organization scoping'}, {status:501})}
export async function POST(){return NextResponse.json({error:'NOT_IMPLEMENTED',message:'Requires authenticated organization scoping'}, {status:501})}
