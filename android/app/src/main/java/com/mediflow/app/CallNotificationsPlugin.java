package com.mediflow.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallNotifications")
public class CallNotificationsPlugin extends Plugin {

    static final String PREFS_NAME = "mediflow_call_notification";
    static final String PREF_PENDING_ACTION = "pending_action";
    static final String PREF_PENDING_CONSULTATION_ID = "pending_consultation_id";
    static final String PREF_PENDING_FROM_ROLE = "pending_from_role";
    static final String PREF_PENDING_AT = "pending_at";

    static final String CHANNEL_ID = "mediflow_calls";
    static final String CHANNEL_NAME = "Calls";

    static final int NOTIFICATION_ID = 424242;

    static final String EXTRA_CONSULTATION_ID = "consultationId";
    static final String EXTRA_FROM_ROLE = "fromRole";

    static final String ACTION_ACCEPT = "ACCEPT";
    static final String ACTION_DECLINE = "DECLINE";

    @Override
    public void load() {
        super.load();
        ensureChannel();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        Context ctx = getContext();
        NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Incoming call alerts");
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    @PluginMethod
    public void showIncomingCall(PluginCall call) {
        ensureChannel();

        String title = call.getString("title", "Incoming call");
        String body = call.getString("body", "Someone is calling");
        String consultationId = call.getString(EXTRA_CONSULTATION_ID, "");
        String fromRole = call.getString(EXTRA_FROM_ROLE, "");

        Context ctx = getContext();

        Intent openIntent = new Intent(ctx, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (consultationId != null) openIntent.putExtra(EXTRA_CONSULTATION_ID, consultationId);
        if (fromRole != null) openIntent.putExtra(EXTRA_FROM_ROLE, fromRole);

        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            ctx,
            1000,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent acceptIntent = new Intent(ctx, CallNotificationActionReceiver.class);
        acceptIntent.setAction(ctx.getPackageName() + ".CALL_ACCEPT");
        acceptIntent.putExtra("action", ACTION_ACCEPT);
        if (consultationId != null) acceptIntent.putExtra(EXTRA_CONSULTATION_ID, consultationId);
        if (fromRole != null) acceptIntent.putExtra(EXTRA_FROM_ROLE, fromRole);

        PendingIntent acceptPendingIntent = PendingIntent.getBroadcast(
            ctx,
            1001,
            acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent declineIntent = new Intent(ctx, CallNotificationActionReceiver.class);
        declineIntent.setAction(ctx.getPackageName() + ".CALL_DECLINE");
        declineIntent.putExtra("action", ACTION_DECLINE);
        if (consultationId != null) declineIntent.putExtra(EXTRA_CONSULTATION_ID, consultationId);
        if (fromRole != null) declineIntent.putExtra(EXTRA_FROM_ROLE, fromRole);

        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
            ctx,
            1002,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(contentPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setFullScreenIntent(contentPendingIntent, true)
            .addAction(0, "Accept", acceptPendingIntent)
            .addAction(0, "Decline", declinePendingIntent);

        NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, builder.build());

        JSObject res = new JSObject();
        res.put("shown", true);
        call.resolve(res);
    }

    @PluginMethod
    public void clearIncomingCall(PluginCall call) {
        Context ctx = getContext();
        NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
        call.resolve();
    }

    @PluginMethod
    public void getPendingAction(PluginCall call) {
        Context ctx = getContext();
        String action = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_PENDING_ACTION, "");
        String consultationId = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_PENDING_CONSULTATION_ID, "");
        String fromRole = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_PENDING_FROM_ROLE, "");
        long at = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getLong(PREF_PENDING_AT, 0);

        JSObject res = new JSObject();
        res.put("action", action == null ? "" : action);
        res.put("consultationId", consultationId == null ? "" : consultationId);
        res.put("fromRole", fromRole == null ? "" : fromRole);
        res.put("at", at);
        call.resolve(res);
    }

    @PluginMethod
    public void clearPendingAction(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(PREF_PENDING_ACTION)
            .remove(PREF_PENDING_CONSULTATION_ID)
            .remove(PREF_PENDING_FROM_ROLE)
            .remove(PREF_PENDING_AT)
            .apply();
        call.resolve();
    }
}
