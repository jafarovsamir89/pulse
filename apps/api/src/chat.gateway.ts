import './env-loader';
import { ValidationPipe } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthService } from './auth';
import { MatchService } from './match';
import { RealtimeAccess } from './realtime-access';

class JoinMessage { @IsString() @MinLength(8) @MaxLength(64) sessionId!: string; }
class SendMessage { @IsString() @MinLength(8) @MaxLength(64) sessionId!: string; @IsUUID() clientMessageId!: string; @IsString() @MinLength(1) @MaxLength(1000) text!: string; }

@WebSocketGateway({ namespace: '/chat', cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;
  constructor(private readonly auth: AuthService, private readonly matches: MatchService, private readonly access: RealtimeAccess) {}

  async handleConnection(client: Socket) {
    await this.access.connect(client, this.token(client));
  }
  handleDisconnect(client: Socket) { this.access.forget(client); }

  async closeSession(sessionId: string, reason: 'ended' | 'blocked') {
    const room = `session:${sessionId}`;
    await this.access.publish(sessionId, 'match.closed', { sessionId, reason }, false);
    this.server.in(room).disconnectSockets(true);
  }

  private token(client: Socket) {
    const cookie = client.handshake.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('pulse_session='));
    return cookie?.slice('pulse_session='.length);
  }
  private authenticate(client: Socket) { return this.auth.resolve(this.token(client)); }

  @SubscribeMessage('match.join')
  async join(@ConnectedSocket() client: Socket, @MessageBody(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) payload: JoinMessage) {
    const user = await this.authenticate(client);
    if (!user) { client.emit('match.error', { code: 'UNAUTHENTICATED' }); throw new WsException('Authentication required'); }
    const userId = user.id;
    const session = await this.matches.currentSession(userId);
    if (!session || session.id !== payload.sessionId) { client.emit('match.error', { code: 'SESSION_ACCESS_DENIED' }); throw new WsException('Session access denied'); }
    await client.join(`session:${session.id}`);
    return { event: 'match.joined', data: { sessionId: session.id } };
  }

  @SubscribeMessage('match.send')
  async send(@ConnectedSocket() client: Socket, @MessageBody(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) payload: SendMessage) {
    const user = await this.authenticate(client);
    if (!user) throw new WsException('Authentication required');
    const userId = user.id;
    try {
      const message = await this.matches.sendMessage(userId, payload.sessionId, payload);
      await this.access.publish(payload.sessionId, 'match.message', { id: message?.id, sessionId: payload.sessionId, authorId: userId, text: message?.text, clientMessageId: payload.clientMessageId, createdAt: message?.createdAt });
      return { event: 'match.sent', data: { clientMessageId: payload.clientMessageId } };
    } catch { throw new WsException('Message could not be sent'); }
  }
}
