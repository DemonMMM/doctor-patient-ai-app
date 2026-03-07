package com.mediflow.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;

public class CallNotificationActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getStringExtra("action") : "";
        String consultationId = intent != null ? intent.getStringExtra(CallNotificationsPlugin.EXTRA_CONSULTATION_ID) : "";
        String fromRole = intent != null ? intent.getStringExtra(CallNotificationsPlugin.EXTRA_FROM_ROLE) : "";

        context.getSharedPreferences(CallNotificationsPlugin.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(CallNotificationsPlugin.PREF_PENDING_ACTION, action == null ? "" : action)
            .putString(CallNotificationsPlugin.PREF_PENDING_CONSULTATION_ID, consultationId == null ? "" : consultationId)
            .putString(CallNotificationsPlugin.PREF_PENDING_FROM_ROLE, fromRole == null ? "" : fromRole)
            .putLong(CallNotificationsPlugin.PREF_PENDING_AT, System.currentTimeMillis())
            .apply();

        NotificationManagerCompat.from(context).cancel(CallNotificationsPlugin.NOTIFICATION_ID);

        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (consultationId != null) open.putExtra(CallNotificationsPlugin.EXTRA_CONSULTATION_ID, consultationId);
        if (fromRole != null) open.putExtra(CallNotificationsPlugin.EXTRA_FROM_ROLE, fromRole);
        context.startActivity(open);
    }
}
